"use client";

import { Button, Card, Form, Input, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createWithdrawal, fetchAccounts, fetchWithdrawals, fetchWithdrawalWhitelist, fetchLatestExchangeRate, fetchAgentEurUsdFee } from "@/lib/api";
import { decimalToMinor, formatMinor } from "@/lib/money";
import { formatExchangeRateMinor, formatFeePercentFromMinor, computeUsdPreviewFromMinor } from "@/lib/rate";
import type { AccountItem, WithdrawalItem, WithdrawalWhitelistItem } from "@/lib/types";
import { useMemo, useState } from "react";

function statusTag(s: string) {
    const v = s.toUpperCase();
    if (v.includes("PENDING")) return <Tag color="blue">{s}</Tag>;
    if (v.includes("FAILED") || v.includes("REJECT")) return <Tag color="red">{s}</Tag>;
    if (v.includes("SENT") || v.includes("APPROV")) return <Tag color="green">{s}</Tag>;
    return <Tag>{s}</Tag>;
}

type WithdrawalFormValues = {
    accountMapId?: string;
    tronAddress?: string;
    amount?: string | number;
};

type ApiError = {
    response?: { data?: { message?: string } };
    message?: string;
};

export default function WithdrawalsPage() {
    const [form] = Form.useForm<WithdrawalFormValues>();
    const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>();
    const [usdPreview, setUsdPreview] = useState<string>("");
    const qc = useQueryClient();
    const [msgApi, ctxHolder] = message.useMessage();

    const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts, refetchInterval: 10_000 });
    const withdrawalsQ = useQuery({ queryKey: ["withdrawals", 50], queryFn: () => fetchWithdrawals(50), refetchInterval: 10_000 });
    const whitelistQ = useQuery({ queryKey: ["withdrawal-whitelist"], queryFn: fetchWithdrawalWhitelist });
    const rateQ = useQuery({ queryKey: ["eur-usd-rate"], queryFn: fetchLatestExchangeRate, refetchInterval: 60_000 });
    const feeQ = useQuery({ queryKey: ["agent-eur-usd-fee"], queryFn: fetchAgentEurUsdFee, refetchInterval: 60_000 });

    const accounts = useMemo(() => accountsQ.data?.items ?? [], [accountsQ.data?.items]);
    const whitelistOptions = useMemo(() => {
        const items: WithdrawalWhitelistItem[] = whitelistQ.data?.items ?? [];
        return items.map((item) => ({
            value: item.address,
            label: item.label ? `${item.label} (${item.address})` : item.address,
        }));
    }, [whitelistQ.data?.items]);
    const hasWhitelist = whitelistOptions.length > 0;
    const exchangeRateMinor = rateQ.data?.rateMinor ?? null;
    const agentFeeMinor = feeQ.data?.feeMinor ?? null;
    const exchangeRateDisplay = formatExchangeRateMinor(exchangeRateMinor);
    const agentFeeDisplay = formatFeePercentFromMinor(agentFeeMinor);
    const hasMeta = typeof exchangeRateMinor === "number" && exchangeRateMinor > 0 && typeof agentFeeMinor === "number" && agentFeeMinor >= 0;
    const canSubmit = hasWhitelist && hasMeta;

    const m = useMutation({
        mutationFn: (payload: { accountMapId: string; tronAddress: string; amountMinor: string }) => {
            if (!hasMeta || exchangeRateMinor === null || agentFeeMinor === null) {
                throw new Error("暂无汇率或手续费信息，暂时无法提现");
            }
            return createWithdrawal({
                accountMapId: payload.accountMapId,
                tronAddress: payload.tronAddress,
                amountMinor: payload.amountMinor,
                exchangeRateMinor,
                agentFeeMinor,
            });
        },
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
        onError: (e: unknown) => {
            const err = e as ApiError;
            const m = err?.response?.data?.message ?? err?.message ?? "提交失败";
            msgApi.error(m);
        },
    });

    const accountOptions = useMemo(() => {
        return accounts.map((a: AccountItem) => {
            const ccy = a.balanceCurrency ?? a.currency ?? "UNKNOWN";
            return {
                value: a.id,
                label: `${a.sunpayAccountId} | 余额 ${formatMinor(a.balanceMinor, ccy)}`,
            };
        });
    }, [accounts]);

    const selectedAccount: AccountItem | undefined = useMemo(() => {
        if (!selectedAccountId) return undefined;
        return accounts.find((a) => a.id === selectedAccountId);
    }, [accounts, selectedAccountId]);

    const columns: ColumnsType<WithdrawalItem> = [
        { title: "状态", dataIndex: "status", key: "status", width: 120, render: (v) => statusTag(v) },
        { title: "提现订单号", dataIndex: "id", key: "id", width: 220, render: (v, r) => <Typography.Text copyable>{v ?? r.id}</Typography.Text> },
        {
            title: "交易哈希",
            dataIndex: "transactionHash",
            key: "transactionHash",
            width: 260,
            render: (v) => (v ? <Typography.Text copyable>{v}</Typography.Text> : <Typography.Text type="secondary">-</Typography.Text>),
        },
        { title: "金额", key: "amount", width: 200, render: (_, r) => <Typography.Text strong>{formatMinor(r.amountMinor, r.currency)}</Typography.Text> },
        { title: "Tron 地址", dataIndex: "tronAddress", key: "tronAddress", width: 320, render: (v) => <Typography.Text copyable>{v}</Typography.Text> },
        { title: "创建时间", dataIndex: "createdAt", key: "createdAt", width: 200, render: (v) => (v ? new Date(v).toLocaleString() : "-") },
    ];

    return (
        <>
            {ctxHolder}
            <Space orientation="vertical" size={16} style={{ width: "100%" }}>
                <Card>
                    <Typography.Title level={4} style={{ marginTop: 0 }}>提现申请</Typography.Title>
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                        选择账户、白名单地址，并输入最多两位小数的提现金额。
                    </Typography.Paragraph>
                    {hasMeta ? (
                        <Typography.Paragraph style={{ marginBottom: 0 }}>
                            当前汇率：{exchangeRateDisplay ? `1 EUR = ${exchangeRateDisplay} USD` : "-"}，手续费率：{agentFeeDisplay ?? "-"}
                        </Typography.Paragraph>
                    ) : (
                        <Typography.Paragraph type="secondary" style={{ marginBottom: 0, color: "#d46b08" }}>
                            暂无汇率或手续费数据，暂时无法提交提现，请稍后重试。
                        </Typography.Paragraph>
                    )}
                </Card>

                <Card>
                    <Form
                        form={form}
                        layout="vertical"
                        initialValues={{ amount: "0" }}
                        onFinish={(v) => {
                            const accountMapId = v.accountMapId;
                            if (!accountMapId) {
                                msgApi.error("请选择账户");
                                return;
                            }
                            const tron = String(v.tronAddress ?? "").trim();
                            if (!tron) {
                                msgApi.error("请选择 Tron 地址");
                                return;
                            }
                            if (!hasMeta) {
                                msgApi.error("暂无汇率或手续费数据，请稍后重试");
                                return;
                            }
                            const amountInput = typeof v.amount === "number" ? v.amount.toString() : (v.amount ?? "").trim();
                            if (!amountInput) {
                                msgApi.error("请输入提现金额");
                                return;
                            }
                            let amountMinor: string;
                            try {
                                amountMinor = decimalToMinor(amountInput);
                            } catch (err) {
                                msgApi.error(err instanceof Error ? err.message : "金额格式不正确");
                                return;
                            }
                            m.mutate({ accountMapId, tronAddress: tron, amountMinor });
                        }}
                        onValuesChange={(changed) => {
                            if (Object.prototype.hasOwnProperty.call(changed, "accountMapId")) {
                                setSelectedAccountId(changed.accountMapId);
                            }
                            if (Object.prototype.hasOwnProperty.call(changed, "amount")) {
                                const raw = typeof changed.amount === "number" ? changed.amount.toString() : (changed.amount ?? "").trim();
                                if (raw && hasMeta) {
                                    try {
                                        const minorStr = decimalToMinor(raw);
                                        const preview = computeUsdPreviewFromMinor(minorStr, exchangeRateMinor!, agentFeeMinor!);
                                        setUsdPreview(preview);
                                    } catch {
                                        setUsdPreview("");
                                    }
                                } else {
                                    setUsdPreview("");
                                }
                            }
                            form.validateFields(["amount"]).catch(() => {});
                        }}
                    >
                        <Space size={16} align="start" wrap style={{ width: "100%" }}>
                            <Form.Item label="选择账户" name="accountMapId" rules={[{ required: true, message: "请选择账户" }]} style={{ minWidth: 560 }}>
                                <Select placeholder="选择一个账户" loading={accountsQ.isLoading} options={accountOptions} showSearch optionFilterProp="label" />
                            </Form.Item>

                            <Form.Item
                                label="Tron 网络地址"
                                name="tronAddress"
                                rules={[{ required: true, message: "请选择 Tron 地址" }]}
                                style={{ minWidth: 420 }}
                            >
                                <Select
                                    placeholder={hasWhitelist ? "请选择白名单地址" : "暂无可用白名单地址"}
                                    loading={whitelistQ.isLoading}
                                    options={whitelistOptions}
                                    showSearch
                                    optionFilterProp="label"
                                    filterOption={(input, option) =>
                                        (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                                    }
                                    disabled={!canSubmit}
                                />
                            </Form.Item>

                            <Form.Item
                                label="提现金额（最多两位小数）"
                                name="amount"
                                rules={[
                                    { required: true, message: "请输入提现金额" },
                                    {
                                        validator: async (_, value) => {
                                            const raw = typeof value === "number" ? value.toString() : (value ?? "").trim();
                                            if (!raw) return Promise.resolve();
                                            let minor: string;
                                            try {
                                                minor = decimalToMinor(raw);
                                            } catch (err) {
                                                throw err instanceof Error ? err : new Error("金额格式不正确");
                                            }
                                            if (BigInt(minor) <= 0n) throw new Error("提现金额必须大于 0");
                                            if (selectedAccount) {
                                                const bal = BigInt(selectedAccount.balanceMinor ?? "0");
                                                if (BigInt(minor) > bal) throw new Error("金额不能超过账户余额");
                                            }
                                        },
                                    },
                                ]}
                                style={{ minWidth: 320 }}
                            >
                                <Input placeholder="请输入金额，最多两位小数" inputMode="decimal" disabled={!canSubmit} />
                            </Form.Item>

                            <Form.Item label=" ">
                                <Button type="primary" htmlType="submit" loading={m.isPending} disabled={!canSubmit}>
                                    提交提现
                                </Button>
                            </Form.Item>
                        </Space>

                        {!hasWhitelist ? (
                            <Typography.Text type="secondary">
                                暂无可用的提现地址，请联系管理员在白名单中配置。
                            </Typography.Text>
                        ) : null}

                        {selectedAccount ? (
                            <Typography.Text type="secondary" style={{ display: "block", marginTop: 8 }}>
                                当前账户余额：{formatMinor(selectedAccount.balanceMinor, selectedAccount.balanceCurrency ?? selectedAccount.currency ?? "UNKNOWN")}（{selectedAccount.balanceMinor} minor）
                            </Typography.Text>
                        ) : null}

                        {usdPreview ? (
                            <Typography.Text type="secondary" style={{ display: "block", marginTop: 8 }}>
                                预计到账：{usdPreview} USD（按当前汇率与手续费计算，仅供参考）
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
