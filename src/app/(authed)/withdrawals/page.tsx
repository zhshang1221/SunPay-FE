"use client";

import { Button, Card, Form, Input, InputNumber, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createWithdrawal, fetchAccounts, fetchWithdrawals } from "@/lib/api";
import { formatMinor } from "@/lib/money";
import type { AccountItem, WithdrawalItem } from "@/lib/types";
import { useMemo, useState } from "react";

function isLikelyTronAddress(addr: string) {
    return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr);
}

function statusTag(s: string) {
    const v = s.toUpperCase();
    if (v.includes("PENDING")) return <Tag color="blue">{s}</Tag>;
    if (v.includes("FAILED") || v.includes("REJECT")) return <Tag color="red">{s}</Tag>;
    if (v.includes("SENT") || v.includes("APPROV")) return <Tag color="green">{s}</Tag>;
    return <Tag>{s}</Tag>;
}

export default function WithdrawalsPage() {
    const [form] = Form.useForm();
    const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>();
    const qc = useQueryClient();
    const [msgApi, ctxHolder] = message.useMessage();

    const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts, refetchInterval: 10_000 });
    const withdrawalsQ = useQuery({ queryKey: ["withdrawals", 50], queryFn: () => fetchWithdrawals(50), refetchInterval: 10_000 });

    const accounts = accountsQ.data?.items ?? [];

    const m = useMutation({
        mutationFn: (payload: { accountMapId: string; tronAddress: string; amountMinor: string }) => createWithdrawal(payload),
        onSuccess: async () => {
            msgApi.success("提现申请已提交");
            form.resetFields();
            setSelectedAccountId(undefined);
            await Promise.all([
                qc.invalidateQueries({ queryKey: ["withdrawals"] }),
                qc.invalidateQueries({ queryKey: ["accounts"] }),
                qc.invalidateQueries({ queryKey: ["balance-summary"] }),
            ]);
        },
        onError: (e: any) => {
            const m = e?.response?.data?.message ?? e?.message ?? "提交失败";
            msgApi.error(m);
        },
    });

    const accountOptions = useMemo(() => {
        return accounts.map((a: AccountItem) => {
            const ccy = a.balanceCurrency ?? a.currency ?? "UNKNOWN";
            return {
                value: a.id,
                label: `${a.sunpayAccountId} | 余额 ${formatMinor(a.balanceMinor, ccy)}（${a.balanceMinor} minor）`,
            };
        });
    }, [accounts]);

    const selectedAccount: AccountItem | undefined = useMemo(() => {
        if (!selectedAccountId) return undefined;
        return accounts.find((a) => a.id === selectedAccountId);
    }, [accounts, selectedAccountId]);

    const columns: ColumnsType<WithdrawalItem> = [
        { title: "状态", dataIndex: "status", key: "status", width: 120, render: (v) => statusTag(v) },
        { title: "金额", key: "amount", width: 200, render: (_, r) => <Typography.Text strong>{formatMinor(r.amountMinor, r.currency)}</Typography.Text> },
        { title: "Tron 地址", dataIndex: "tronAddress", key: "tronAddress", width: 320, render: (v) => <Typography.Text copyable>{v}</Typography.Text> },
        { title: "账户(Sunpay)", key: "account", width: 260, render: (_, r) => <Typography.Text copyable>{r.accountMap?.sunpayAccountId ?? r.accountMapId}</Typography.Text> },
        { title: "飞书推送", dataIndex: "larkSent", key: "larkSent", width: 120, render: (v) => (v ? <Tag color="green">SENT</Tag> : <Tag>NO</Tag>) },
        { title: "创建时间", dataIndex: "createdAt", key: "createdAt", width: 200, render: (v) => (v ? new Date(v).toLocaleString() : "-") },
    ];

    return (
        <>
            {ctxHolder}
            <Space orientation="vertical" size={16} style={{ width: "100%" }}>
                <Card>
                    <Typography.Title level={4} style={{ marginTop: 0 }}>提现申请</Typography.Title>
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                        选择账户、输入 Tron 地址与提现数量（minor）。系统会扣减余额并推送飞书机器人。
                    </Typography.Paragraph>
                </Card>

                <Card>
                    <Form
                        form={form}
                        layout="vertical"
                        onFinish={(v) => {
                            const tron = String(v.tronAddress ?? "").trim();
                            if (!isLikelyTronAddress(tron)) {
                                msgApi.error("Tron 地址格式不正确（应以 T 开头，长度约 34）");
                                return;
                            }
                            m.mutate({ accountMapId: v.accountMapId, tronAddress: tron, amountMinor: String(v.amountMinor) });
                        }}
                        onValuesChange={(changed) => {
                            if (Object.prototype.hasOwnProperty.call(changed, "accountMapId")) {
                                setSelectedAccountId(changed.accountMapId);
                            }
                            // 触发实时校验
                            form.validateFields(["amountMinor"]).catch(() => { });
                        }}
                    >
                        <Space size={16} align="start" wrap style={{ width: "100%" }}>
                            <Form.Item label="选择账户" name="accountMapId" rules={[{ required: true, message: "请选择账户" }]} style={{ minWidth: 560 }}>
                                <Select placeholder="选择一个账户" loading={accountsQ.isLoading} options={accountOptions} showSearch optionFilterProp="label" />
                            </Form.Item>

                            <Form.Item label="Tron 网络地址" name="tronAddress" rules={[{ required: true, message: "请输入 Tron 地址" }]} style={{ minWidth: 420 }}>
                                <Input placeholder="T..." />
                            </Form.Item>

                            <Form.Item
                                label="提现数量（minor）"
                                name="amountMinor"
                                rules={[
                                    { required: true, message: "请输入提现数量" },
                                    {
                                        validator: async (_, value) => {
                                            if (value === undefined || value === null) return;
                                            const amt = BigInt(String(value));
                                            if (amt <= 0n) throw new Error("提现数量必须大于 0");
                                            if (selectedAccount) {
                                                const bal = BigInt(selectedAccount.balanceMinor ?? "0");
                                                if (amt > bal) throw new Error(`余额不足：可用 ${bal.toString()} minor`);
                                            }
                                        },
                                    },
                                ]}
                                style={{ minWidth: 240 }}
                            >
                                <InputNumber min={1} precision={0} style={{ width: "100%" }} />
                            </Form.Item>

                            <Form.Item label=" ">
                                <Button type="primary" htmlType="submit" loading={m.isPending}>
                                    提交提现
                                </Button>
                            </Form.Item>
                        </Space>

                        {selectedAccount ? (
                            <Typography.Text type="secondary">
                                当前账户余额：{formatMinor(selectedAccount.balanceMinor, selectedAccount.balanceCurrency ?? selectedAccount.currency ?? "UNKNOWN")}（{selectedAccount.balanceMinor} minor）
                            </Typography.Text>
                        ) : null}
                    </Form>
                </Card>

                <Card>
                    <Typography.Title level={5} style={{ marginTop: 0 }}>提现列表</Typography.Title>
                    <Table rowKey="id" loading={withdrawalsQ.isLoading} columns={columns} dataSource={withdrawalsQ.data?.items ?? []} pagination={{ pageSize: 10 }} scroll={{ x: 1200 }} />
                </Card>
            </Space>
        </>
    );
}
