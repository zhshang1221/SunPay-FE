"use client";

import {
    Button,
    Card,
    Descriptions,
    Drawer,
    Form,
    Input,
    Modal,
    Space,
    Table,
    Tabs,
    Tag,
    Typography,
    message,
    Steps,
    Radio,
    Divider,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    fetchAccounts,
    fetchTransactions,
    fetchWithdrawals,
    createCustomer,
    createAccount,
} from "@/lib/api";
import { formatMinor } from "@/lib/money";
import type { AccountItem, TransactionEventItem, WithdrawalItem } from "@/lib/types";

type UserKind = "INDIVIDUAL" | "COMPANY";

function renderStatus(s?: string | null) {
    if (!s) return <Tag>UNKNOWN</Tag>;
    const v = s.toUpperCase();
    if (v.includes("SUBMIT") || v.includes("REVIEW")) return <Tag color="blue">{s}</Tag>;
    if (v.includes("SUCCESS") || v.includes("APPROV") || v.includes("ACTIVE")) return <Tag color="green">{s}</Tag>;
    if (v.includes("FAIL") || v.includes("REJECT")) return <Tag color="red">{s}</Tag>;
    return <Tag>{s}</Tag>;
}

function pickDisplayName(a: AccountItem): string {
    const cm = a.customerMap;
    if (!cm) return "-";
    const t = (cm.customerType ?? "").toUpperCase();
    if (t === "COMPANY") {
        return (cm as any).companyName || (cm as any).displayName || cm.outUserId || "-";
    }
    const name = [(cm as any).firstName, (cm as any).lastName].filter(Boolean).join(" ").trim();
    return name || (cm as any).displayName || cm.outUserId || "-";
}

function safeJsonParse(s?: string | null) {
    if (!s) return null;
    try {
        return JSON.parse(s);
    } catch {
        return null;
    }
}

function extractReceivingInfo(account: AccountItem) {
    const raw = safeJsonParse((account as any).rawJson);
    const data = raw?.data ?? raw?.sunpayResp?.data ?? raw?.data?.data;

    if (data?.iban || data?.swift_bic || data?.account_number) {
        return {
            iban: data.iban ?? null,
            swiftBic: data.swift_bic ?? null,
            accountNumber: data.account_number ?? null,
            bankCountry: data.bank_country ?? null,
            currency: data.currency ?? account.balanceCurrency ?? account.currency ?? null,
            bankName: data.bank_name ?? null,
            bankAccountHolderName: data.bank_account_holder_name ?? null,
        };
    }

    return {
        iban: null,
        swiftBic: null,
        accountNumber: null,
        bankCountry: null,
        currency: account.balanceCurrency ?? account.currency ?? null,
        hint:
            "暂无收款地址字段可展示。建议后端 /api/accounts 返回 rawJson（创建账户回包含 iban/swift/account_number），或在 AccountMap 落库 iban/swift/accountNumber。",
    };
}

export default function AccountsPage() {
    const qc = useQueryClient();
    const [msgApi, ctxHolder] = message.useMessage();

    const accountsQ = useQuery({
        queryKey: ["accounts"],
        queryFn: fetchAccounts,
        refetchInterval: 10_000,
    });

    const txQ = useQuery({
        queryKey: ["transactions", 200],
        queryFn: () => fetchTransactions(200),
        refetchInterval: 10_000,
    });

    const wdQ = useQuery({
        queryKey: ["withdrawals", 200],
        queryFn: () => fetchWithdrawals(200),
        refetchInterval: 10_000,
    });

    const accounts = accountsQ.data?.items ?? [];
    const txItems: TransactionEventItem[] = txQ.data?.items ?? [];
    const wdItems: WithdrawalItem[] = (wdQ.data?.items ?? []) as any;

    // ---------- Detail Drawer ----------
    const [detailOpen, setDetailOpen] = useState(false);
    const [detailAccount, setDetailAccount] = useState<AccountItem | null>(null);

    // ---------- Create Modal with Steps ----------
    const [createOpen, setCreateOpen] = useState(false);
    const [step, setStep] = useState(0); // 0 choose, 1 form, 2 done
    const [userKind, setUserKind] = useState<UserKind>("COMPANY");
    const [createdResult, setCreatedResult] = useState<any>(null);

    const [form] = Form.useForm();

    const openCreate = () => {
        setCreateOpen(true);
        setStep(0);
        setUserKind("COMPANY");
        setCreatedResult(null);
        form.resetFields();
    };

    const applyDefaultsForKind = (kind: UserKind) => {
        // 给一些合理默认，减少填写成本（你也可以改成空）
        form.setFieldsValue({
            customerType: kind,
            customerCountryCode: kind === "COMPANY" ? "DE" : "FR",
            currency: "EUR",
            accountCountryCode: "FR",
            nationality: "FR",
            tradingCountry: "FR",
        });
    };

    const goNextFromChoose = () => {
        applyDefaultsForKind(userKind);
        setStep(1);
    };

    const createM = useMutation({
        mutationFn: async (v: any) => {
            const t = (v.customerType ?? userKind ?? "COMPANY").toUpperCase();

            // 1) customer
            const customerPayload: any = {
                out_user_id: v.outUserId,
                customer_email: v.email,
                customer_type: t,
                country_code: v.customerCountryCode,
            };

            if (t === "COMPANY") {
                customerPayload.company_name = v.companyName;
                customerPayload.registration_number = v.registrationNumber;
                customerPayload.company_representative_name = v.repName;
                customerPayload.company_representative_document_type = v.repDocType;
                customerPayload.company_representative_number = v.repDocNo;

                customerPayload.company_document_id = v.docId;
                customerPayload.company_handheld_document_id = v.companyHandheldDocId ?? "";
                customerPayload.id_front_side_document_id = v.docId;
                customerPayload.id_back_side_document_id = v.docId;
            }

            const customerRes = await createCustomer(customerPayload);
            const customerMapId = customerRes.customer?.id;
            if (!customerMapId) throw new Error("Create customer failed: missing customer.id");

            // 2) account
            const accountPayload: any = {
                customer_map_id: customerMapId,
                currency: v.currency,
                country_code: v.accountCountryCode,

                first_name: v.firstName,
                middle_name: v.middleName ?? "",
                last_name: v.lastName,
                address_line: v.addressLine,
                city: v.city,
                post_code: v.postCode,
                nationality: v.nationality,
                birth_date: v.birthDate,

                trading_country: v.tradingCountry,
                trading_city: v.tradingCity,
                trading_address: v.tradingAddress,
            };

            const accountRes = await createAccount(accountPayload);
            return { customerRes, accountRes };
        },
        onSuccess: async (res) => {
            msgApi.success("创建成功：用户已开通账户");
            setCreatedResult(res);
            setStep(2);

            await Promise.all([
                qc.invalidateQueries({ queryKey: ["accounts"] }),
                qc.invalidateQueries({ queryKey: ["balance-summary"] }),
                qc.invalidateQueries({ queryKey: ["transactions"] }),
                qc.invalidateQueries({ queryKey: ["withdrawals"] }),
            ]);
        },
        onError: (e: any) => {
            const m = e?.response?.data?.message ?? e?.message ?? "创建失败";
            msgApi.error(m);
        },
    });

    // ---------- Accounts columns ----------
    const columns: ColumnsType<AccountItem> = [
        {
            title: "姓名 / 公司名",
            key: "name",
            width: 240,
            render: (_, r) => <Typography.Text>{pickDisplayName(r)}</Typography.Text>,
        },
        {
            title: "邮箱",
            key: "email",
            width: 280,
            render: (_, r) => <Typography.Text>{r.customerMap?.customerEmail ?? "-"}</Typography.Text>,
        },
        {
            title: "余额",
            key: "balance",
            width: 240,
            render: (_, r) => {
                const ccy = r.balanceCurrency ?? r.currency ?? "UNKNOWN";
                return (
                    <Space>
                        <Typography.Text strong>{formatMinor(r.balanceMinor, ccy)}</Typography.Text>
                        <Tag>{ccy}</Tag>
                    </Space>
                );
            },
        },
        {
            title: "账户状态",
            dataIndex: "status",
            key: "status",
            width: 140,
            render: (v) => renderStatus(v),
        },
        {
            title: "操作",
            key: "actions",
            width: 140,
            render: (_, r) => (
                <Button
                    size="small"
                    onClick={() => {
                        setDetailAccount(r);
                        setDetailOpen(true);
                    }}
                >
                    详情
                </Button>
            ),
        },
    ];

    // ---------- Expanded tabs ----------
    const depositColumns: ColumnsType<TransactionEventItem> = [
        {
            title: "状态",
            dataIndex: "bizStatus",
            key: "bizStatus",
            width: 120,
            render: (v) => <Tag color={String(v).includes("SUCCESS") ? "green" : "blue"}>{v}</Tag>,
        },
        {
            title: "订单号",
            key: "orderNo",
            width: 260,
            render: (_, r) => {
                const order = r.orderNo ?? r.reference ?? "-";
                return order === "-" ? "-" : <Typography.Text copyable>{order}</Typography.Text>;
            },
        },
        {
            title: "金额",
            key: "amt",
            width: 180,
            render: (_, r) =>
                <Typography.Text strong>{formatMinor(r.settlementAmount ?? "0", r.settlementCurrency ?? "UNKNOWN")}</Typography.Text>,
        },
        {
            title: "时间",
            dataIndex: "receivedAt",
            key: "receivedAt",
            width: 200,
            render: (v) => (v ? new Date(v).toLocaleString() : "-"),
        },
    ];

    const withdrawColumns: ColumnsType<WithdrawalItem> = [
        {
            title: "状态",
            dataIndex: "status",
            key: "status",
            width: 120,
            render: (v) => <Tag>{String(v)}</Tag>,
        },
        {
            title: "订单号",
            key: "orderNo",
            width: 260,
            render: (_, r) => <Typography.Text copyable>{r.id}</Typography.Text>,
        },
        {
            title: "金额",
            key: "amt",
            width: 180,
            render: (_, r) => <Typography.Text strong>{formatMinor(r.amountMinor, r.currency)}</Typography.Text>,
        },
        {
            title: "时间",
            dataIndex: "createdAt",
            key: "createdAt",
            width: 200,
            render: (v: any) => (v ? new Date(v).toLocaleString() : "-"),
        },
    ];

    const expandedRowRender = (acc: AccountItem) => {
        const deposits = txItems
            .filter((t) => t.recipientAccountId === acc.sunpayAccountId)
            .sort((a, b) => new Date(b.receivedAt ?? 0).getTime() - new Date(a.receivedAt ?? 0).getTime());

        const withdraws = wdItems
            .filter((w) => w.accountMapId === acc.id)
            .sort((a: any, b: any) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());

        return (
            <Tabs
                defaultActiveKey="deposit"
                items={[
                    {
                        key: "deposit",
                        label: `存款（${deposits.length}）`,
                        children: (
                            <Table
                                rowKey="id"
                                columns={depositColumns}
                                dataSource={deposits}
                                pagination={{ pageSize: 5 }}
                                size="small"
                                scroll={{ x: 920 }}
                            />
                        ),
                    },
                    {
                        key: "withdraw",
                        label: `提现（${withdraws.length}）`,
                        children: (
                            <Table
                                rowKey="id"
                                columns={withdrawColumns}
                                dataSource={withdraws}
                                pagination={{ pageSize: 5 }}
                                size="small"
                                scroll={{ x: 920 }}
                            />
                        ),
                    },
                ]}
            />
        );
    };

    const receivingInfo = detailAccount ? extractReceivingInfo(detailAccount) : null;

    // ---------- Create modal footer (smooth) ----------
    const modalFooter = useMemo(() => {
        if (step === 0) {
            return [
                <Button key="cancel" onClick={() => setCreateOpen(false)}>
                    取消
                </Button>,
                <Button key="next" type="primary" onClick={goNextFromChoose}>
                    下一步
                </Button>,
            ];
        }
        if (step === 1) {
            return [
                <Button key="back" onClick={() => setStep(0)} disabled={createM.isPending}>
                    上一步
                </Button>,
                <Button key="cancel" onClick={() => setCreateOpen(false)} disabled={createM.isPending}>
                    取消
                </Button>,
                <Button
                    key="submit"
                    type="primary"
                    loading={createM.isPending}
                    onClick={() => form.submit()}
                >
                    创建
                </Button>,
            ];
        }
        // step === 2
        return [
            <Button
                key="close"
                type="primary"
                onClick={() => {
                    setCreateOpen(false);
                    setStep(0);
                }}
            >
                完成
            </Button>,
        ];
    }, [step, createM.isPending, form, userKind]);

    return (
        <>
            {ctxHolder}
            <Space orientation="vertical" size={16} style={{ width: "100%" }}>
                <Card>
                    <Space style={{ width: "100%", justifyContent: "space-between" }}>
                        <div>
                            <Typography.Title level={4} style={{ marginTop: 0 }}>
                                账户与余额
                            </Typography.Title>
                            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                                账户行可展开查看【存款/提现】；点击详情查看收款地址信息。
                            </Typography.Paragraph>
                        </div>

                        <Button type="primary" onClick={openCreate}>
                            创建用户并开通账户
                        </Button>
                    </Space>
                </Card>

                <Card>
                    <Table
                        rowKey="id"
                        loading={accountsQ.isLoading || txQ.isLoading || wdQ.isLoading}
                        columns={columns}
                        dataSource={accounts}
                        pagination={{ pageSize: 10 }}
                        scroll={{ x: 1040 }}
                        expandable={{
                            expandedRowRender,
                            rowExpandable: () => true,
                            expandRowByClick: true,
                            columnWidth: 48,
                        }}
                    />
                </Card>
            </Space>

            {/* ✅ Smooth create modal with Steps */}
            <Modal
                title="创建用户并开通账户"
                open={createOpen}
                onCancel={() => setCreateOpen(false)}
                footer={modalFooter}
                width={920}
                destroyOnHidden
            >
                <Steps
                    current={step}
                    items={[
                        { title: "选择类型" },
                        { title: "填写信息" },
                        { title: "完成" },
                    ]}
                />

                <Divider />

                {step === 0 ? (
                    <div>
                        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
                            请选择用户类型。下一步会根据类型展示不同的填写项。
                        </Typography.Paragraph>

                        <Radio.Group
                            value={userKind}
                            onChange={(e) => setUserKind(e.target.value)}
                            style={{ marginTop: 8 }}
                        >
                            <Space size={24}>
                                <Radio.Button value="INDIVIDUAL">个人用户</Radio.Button>
                                <Radio.Button value="COMPANY">企业用户</Radio.Button>
                            </Space>
                        </Radio.Group>
                    </div>
                ) : null}

                {step === 1 ? (
                    <Form
                        form={form}
                        layout="vertical"
                        onFinish={(v) => {
                            // force customerType from step choice
                            v.customerType = userKind;
                            createM.mutate(v);
                        }}
                    >
                        <Form.Item name="customerType" hidden>
                            <Input />
                        </Form.Item>

                        <Typography.Title level={5}>基本信息</Typography.Title>
                        <Space wrap size={16} style={{ width: "100%" }}>
                            <Form.Item label="邮箱" name="email" rules={[{ required: true, type: "email" }]} style={{ minWidth: 260 }}>
                                <Input />
                            </Form.Item>

                            <Form.Item label="外部用户号（out_user_id）" name="outUserId" rules={[{ required: true }]} style={{ minWidth: 260 }}>
                                <Input />
                            </Form.Item>

                            <Form.Item label="国别（customer country_code）" name="customerCountryCode" rules={[{ required: true }]} style={{ minWidth: 220 }}>
                                <Input placeholder="DE / FR" />
                            </Form.Item>
                        </Space>

                        {userKind === "COMPANY" ? (
                            <>
                                <Typography.Title level={5}>企业信息</Typography.Title>
                                <Space wrap size={16} style={{ width: "100%" }}>
                                    <Form.Item label="公司名" name="companyName" rules={[{ required: true }]} style={{ minWidth: 260 }}>
                                        <Input />
                                    </Form.Item>
                                    <Form.Item label="注册号" name="registrationNumber" rules={[{ required: true }]} style={{ minWidth: 260 }}>
                                        <Input />
                                    </Form.Item>
                                    <Form.Item label="法人/代表姓名" name="repName" rules={[{ required: true }]} style={{ minWidth: 260 }}>
                                        <Input />
                                    </Form.Item>
                                    <Form.Item label="代表证件类型" name="repDocType" rules={[{ required: true }]} style={{ minWidth: 200 }}>
                                        <Input placeholder="IDCARD" />
                                    </Form.Item>
                                    <Form.Item label="代表证件号" name="repDocNo" rules={[{ required: true }]} style={{ minWidth: 260 }}>
                                        <Input />
                                    </Form.Item>
                                    <Form.Item label="document_id（复用）" name="docId" rules={[{ required: true }]} style={{ minWidth: 420 }}>
                                        <Input />
                                    </Form.Item>
                                </Space>
                            </>
                        ) : (
                            <>
                                <Typography.Title level={5}>个人信息</Typography.Title>
                                <Space wrap size={16} style={{ width: "100%" }}>
                                    <Form.Item label="名（first_name）" name="firstName" rules={[{ required: true }]} style={{ minWidth: 220 }}>
                                        <Input />
                                    </Form.Item>
                                    <Form.Item label="姓（last_name）" name="lastName" rules={[{ required: true }]} style={{ minWidth: 220 }}>
                                        <Input />
                                    </Form.Item>
                                </Space>
                            </>
                        )}

                        <Typography.Title level={5}>账户信息（用于开通收款账户）</Typography.Title>
                        <Space wrap size={16} style={{ width: "100%" }}>
                            <Form.Item label="币种" name="currency" rules={[{ required: true }]} style={{ minWidth: 160 }}>
                                <Input placeholder="EUR" />
                            </Form.Item>
                            <Form.Item label="账户国别（account country_code）" name="accountCountryCode" rules={[{ required: true }]} style={{ minWidth: 240 }}>
                                <Input placeholder="FR" />
                            </Form.Item>

                            <Form.Item label="名（first_name）" name="firstName" rules={[{ required: true }]} style={{ minWidth: 220 }}>
                                <Input />
                            </Form.Item>
                            <Form.Item label="姓（last_name）" name="lastName" rules={[{ required: true }]} style={{ minWidth: 220 }}>
                                <Input />
                            </Form.Item>

                            <Form.Item label="地址（address_line）" name="addressLine" rules={[{ required: true }]} style={{ minWidth: 360 }}>
                                <Input />
                            </Form.Item>
                            <Form.Item label="城市（city）" name="city" rules={[{ required: true }]} style={{ minWidth: 220 }}>
                                <Input />
                            </Form.Item>
                            <Form.Item label="邮编（post_code）" name="postCode" rules={[{ required: true }]} style={{ minWidth: 200 }}>
                                <Input />
                            </Form.Item>
                            <Form.Item label="国籍（nationality）" name="nationality" rules={[{ required: true }]} style={{ minWidth: 200 }}>
                                <Input placeholder="FR" />
                            </Form.Item>
                            <Form.Item label="出生日期（birth_date）" name="birthDate" rules={[{ required: true }]} style={{ minWidth: 260 }}>
                                <Input placeholder="1996-02-21 00:00:00" />
                            </Form.Item>

                            <Form.Item label="trading_country" name="tradingCountry" rules={[{ required: true }]} style={{ minWidth: 200 }}>
                                <Input />
                            </Form.Item>
                            <Form.Item label="trading_city" name="tradingCity" rules={[{ required: true }]} style={{ minWidth: 220 }}>
                                <Input />
                            </Form.Item>
                            <Form.Item label="trading_address" name="tradingAddress" rules={[{ required: true }]} style={{ minWidth: 420 }}>
                                <Input />
                            </Form.Item>
                        </Space>
                    </Form>
                ) : null}

                {step === 2 ? (
                    <Card>
                        <Typography.Title level={5} style={{ marginTop: 0 }}>
                            创建完成
                        </Typography.Title>

                        <Descriptions size="small" column={1} bordered>
                            <Descriptions.Item label="用户类型">{userKind === "COMPANY" ? "企业" : "个人"}</Descriptions.Item>
                            <Descriptions.Item label="账户状态">
                                {createdResult?.accountRes?.sunpayResp?.data?.status ??
                                    createdResult?.accountRes?.account?.status ??
                                    "UNKNOWN"}
                            </Descriptions.Item>
                            <Descriptions.Item label="提示">已刷新账户列表，请在列表中查看新创建的账户</Descriptions.Item>
                        </Descriptions>
                    </Card>
                ) : null}
            </Modal>

            {/* Detail drawer */}
            <Drawer title="账户详情" open={detailOpen} onClose={() => setDetailOpen(false)} width={520}>
                {detailAccount ? (
                    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
                        <Descriptions size="small" column={1} bordered>
                            <Descriptions.Item label="姓名/公司名">{pickDisplayName(detailAccount)}</Descriptions.Item>
                            <Descriptions.Item label="邮箱">{detailAccount.customerMap?.customerEmail ?? "-"}</Descriptions.Item>
                            <Descriptions.Item label="余额">
                                {formatMinor(detailAccount.balanceMinor, detailAccount.balanceCurrency ?? detailAccount.currency ?? "UNKNOWN")}
                            </Descriptions.Item>
                            <Descriptions.Item label="账户状态">{detailAccount.status ?? "-"}</Descriptions.Item>
                        </Descriptions>

                        <Card size="small" title="收款地址信息（用于转账入金）">
                            {receivingInfo ? (
                                <Descriptions size="small" column={1}>
                                    <Descriptions.Item label="IBAN">{receivingInfo.iban ?? "-"}</Descriptions.Item>
                                    <Descriptions.Item label="SWIFT/BIC">{receivingInfo.swiftBic ?? "-"}</Descriptions.Item>
                                    <Descriptions.Item label="Account Number">{receivingInfo.accountNumber ?? "-"}</Descriptions.Item>
                                    <Descriptions.Item label="Bank Country">{receivingInfo.bankCountry ?? "-"}</Descriptions.Item>
                                    <Descriptions.Item label="Bank Name">{receivingInfo.bankName ?? "-"}</Descriptions.Item>
                                    <Descriptions.Item label="Account Holder">{receivingInfo.bankAccountHolderName ?? "-"}</Descriptions.Item>
                                    <Descriptions.Item label="Currency">{receivingInfo.currency ?? "-"}</Descriptions.Item>
                                </Descriptions>
                            ) : (
                                <Typography.Text type="secondary">暂无收款地址信息</Typography.Text>
                            )}
                            {receivingInfo?.hint ? (
                                <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
                                    {receivingInfo.hint}
                                </Typography.Paragraph>
                            ) : null}
                        </Card>
                    </Space>
                ) : null}
            </Drawer>
        </>
    );
}
