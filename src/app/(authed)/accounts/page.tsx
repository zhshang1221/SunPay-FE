"use client";

import {
    Button,
    Card,
    DatePicker,
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
    Select,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { RuleObject } from "antd/es/form";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    fetchAccounts,
    fetchCustomers,
    fetchTransactions,
    fetchWithdrawals,
    createCustomer,
    createAccount,
    createWithdrawal,
    fetchWithdrawalWhitelist,
} from "@/lib/api";
import type { CreateAccountPayload, CreateCustomerPayload } from "@/lib/api";
import { decimalToMinor, formatMinor } from "@/lib/money";
import type { AccountItem, CustomerItem, TransactionEventItem, WithdrawalItem, WithdrawalWhitelistItem } from "@/lib/types";

type UserKind = "INDIVIDUAL" | "COMPANY";
type CustomerRow = {
    key: string;
    customer: CustomerItem;
    accounts: AccountItem[];
    latestAccount?: AccountItem;
    hasActiveAccount: boolean;
};

type DepositRow = TransactionEventItem & { accountLabel?: string };
type WithdrawRow = WithdrawalItem & { accountLabel?: string };

type CustomerFormValues = {
    customerType?: UserKind;
    email?: string;
    outUserId?: string;
    customerCountryCode?: string;
    companyName?: string;
    registrationNumber?: string;
    repName?: string;
    repDocType?: string;
    repDocNo?: string;
    firstName?: string;
    lastName?: string;
    idDocumentType?: string;
    idDocumentNumber?: string;
};

type AccountFormValues = {
    currency: string;
    accountCountryCode: string;
    addressLine: string;
    city: string;
    postCode: string;
    nationality: string;
    birthDate: string | dayjs.Dayjs;
};

type ApiError = {
    response?: { data?: { message?: string } };
    message?: string;
};

const COUNTRY_OPTIONS = [
    { value: "FR", label: "法国 (FR)" },
    { value: "DE", label: "德国 (DE)" },
    { value: "ES", label: "西班牙 (ES)" },
    { value: "IT", label: "意大利 (IT)" },
    { value: "GB", label: "英国 (GB)" },
    { value: "US", label: "美国 (US)" },
    { value: "CN", label: "中国 (CN)" },
    { value: "SG", label: "新加坡 (SG)" },
    { value: "HK", label: "中国香港 (HK)" },
    { value: "NL", label: "荷兰 (NL)" },
];

const DOCUMENT_TYPE_OPTIONS = [
    { value: "IDCARD", label: "IDCARD" },
    { value: "PASSPORT", label: "PASSPORT" },
    { value: "DRIVINGLICENCE", label: "DRIVINGLICENCE" },
];

const countryFilterOption = (input: string, option?: { label?: string; value?: string }) =>
    (option?.label ?? "").toLowerCase().includes(input.toLowerCase());

function normalizeStatus(s?: string | null) {
    return (s ?? "").trim().toUpperCase();
}

function generateOutUserId(kind: UserKind) {
    const prefix = kind === "COMPANY" ? "COM" : "IND";
    return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function validateMultiWordEnglish(value?: string) {
    if (!value) return false;
    const words = value.trim().split(/\s+/);
    if (words.length < 2) return false;
    return words.every((w) => /^[A-Za-z]+$/.test(w));
}

function buildMultiWordValidator(label: string) {
    return (_: RuleObject, value?: string) => {
        if (!value) {
            return Promise.reject(new Error(`${label}不能为空`));
        }
        if (!validateMultiWordEnglish(value)) {
            return Promise.reject(new Error(`${label}需包含至少两个英文单词，并用空格分隔`));
        }
        return Promise.resolve();
    };
}

function isReviewingStatus(s?: string | null) {
    const v = normalizeStatus(s);
    return v === "REVIEWING" || v.includes("REVIEW");
}

function isRejectedStatus(s?: string | null) {
    const v = normalizeStatus(s);
    return v === "REJECTED" || v.includes("REJECT") || v.includes("FAIL");
}

function isApprovedStatus(s?: string | null) {
    const v = normalizeStatus(s);
    return v === "APPROVED" || v === "ACTIVE" || v.includes("APPROV");
}

function isActiveAccountStatus(s?: string | null) {
    const v = normalizeStatus(s);
    return v.includes("ACTIVE") || v.includes("APPROV") || v.includes("SUCCESS");
}

type WithCreated = { createdAt?: string | null };

function compareByCreatedDesc(a?: WithCreated, b?: WithCreated) {
    const ad = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bd = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bd - ad;
}

function filterRejectedWithNewerSubmission<T extends WithCreated>(
    items: T[],
    getEmail: (item: T) => string | null | undefined,
    getStatus: (item: T) => string | null | undefined,
) {
    const grouped = new Map<string, T[]>();
    const fallbackKey = (item: T, idx: number) => `__NO_EMAIL__${idx}`;

    items.forEach((item, idx) => {
        const key = (getEmail(item) ?? fallbackKey(item, idx)).toLowerCase();
        const bucket = grouped.get(key);
        if (bucket) bucket.push(item);
        else grouped.set(key, [item]);
    });

    const result: T[] = [];
    grouped.forEach((bucket) => {
        const sorted = bucket.slice().sort(compareByCreatedDesc);
        sorted.forEach((entry, idx) => {
            if (isRejectedStatus(getStatus(entry)) && idx > 0) {
                return;
            }
            result.push(entry);
        });
    });

    return result.sort(compareByCreatedDesc);
}

function extractErrorMessage(err: unknown, fallback: string) {
    if (typeof err === "string" && err.trim().length > 0) return err;
    if (typeof err === "object" && err !== null) {
        const apiErr = err as ApiError;
        const respMsg = apiErr.response?.data?.message;
        if (respMsg && respMsg.length > 0) return respMsg;
        if (apiErr.message && apiErr.message.length > 0) return apiErr.message;
    }
    return fallback;
}

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
        return cm.companyName || cm.displayName || cm.outUserId || "-";
    }
    const name = [cm.firstName, cm.lastName].filter(Boolean).join(" ").trim();
    return name || cm.displayName || cm.outUserId || "-";
}

function pickCustomerDisplayName(c: CustomerItem) {
    const kind = (c.customerType ?? "").toUpperCase();
    if (kind === "COMPANY") {
        return c.companyName ?? c.outUserId ?? "-";
    }
    const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
    return name || c.outUserId || "-";
}

function formatAccountLabel(acc: AccountItem) {
    const name = pickDisplayName(acc);
    const ccy = acc.balanceCurrency ?? acc.currency ?? "";
    return ccy ? `${name} (${ccy})` : name;
}

export default function AccountsPage() {
    const qc = useQueryClient();
    const [msgApi, ctxHolder] = message.useMessage();

    const customersQ = useQuery({
        queryKey: ["customers"],
        queryFn: fetchCustomers,
        refetchInterval: 10_000,
    });

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

    const whitelistQ = useQuery({
        queryKey: ["withdrawal-whitelist"],
        queryFn: fetchWithdrawalWhitelist,
    });

    const customers = useMemo(() => customersQ.data?.items ?? [], [customersQ.data?.items]);
    const accounts = useMemo(() => accountsQ.data?.items ?? [], [accountsQ.data?.items]);
    const txItems: TransactionEventItem[] = txQ.data?.items ?? [];
    const wdItems: WithdrawalItem[] = wdQ.data?.items ?? [];
    const withdrawalAddressOptions = useMemo(() => {
        const items: WithdrawalWhitelistItem[] = whitelistQ.data?.items ?? [];
        return items.map((item) => ({
            value: item.address,
            label: item.label ? `${item.label} (${item.address})` : item.address,
        }));
    }, [whitelistQ.data?.items]);
    const hasWithdrawalAddresses = withdrawalAddressOptions.length > 0;

    const filteredCustomers = useMemo(
        () =>
            filterRejectedWithNewerSubmission(
                customers,
                (item) => item.customerEmail,
                (item) => item.status,
            ),
        [customers],
    );

    const filteredAccounts = useMemo(
        () =>
            filterRejectedWithNewerSubmission(
                accounts,
                (item) => item.customerMap?.customerEmail ?? item.email,
                (item) => item.status,
            ),
        [accounts],
    );

    const accountsByCustomer = useMemo(() => {
        const map: Record<string, AccountItem[]> = {};
        filteredAccounts.forEach((acc) => {
            const key = acc.customerMap?.id;
            if (!key) return;
            if (!map[key]) map[key] = [];
            map[key].push(acc);
        });
        Object.values(map).forEach((list) => list.sort(compareByCreatedDesc));
        return map;
    }, [filteredAccounts]);

    const customerRows: CustomerRow[] = useMemo(
        () =>
            filteredCustomers.map((customer) => {
                const list = accountsByCustomer[customer.id] ?? [];
                const hasActive = list.some((acc) => isActiveAccountStatus(acc.status));
                return {
                    key: customer.id,
                    customer,
                    accounts: list,
                    latestAccount: list[0],
                    hasActiveAccount: hasActive,
                };
            }),
        [filteredCustomers, accountsByCustomer],
    );

    // ---------- Detail Drawer ----------
    const [detailOpen, setDetailOpen] = useState(false);
    const [detailAccount, setDetailAccount] = useState<AccountItem | null>(null);

    // ---------- Create Customer Modal with Steps ----------
    const [customerModalOpen, setCustomerModalOpen] = useState(false);
    const [customerStep, setCustomerStep] = useState(0); // 0 choose, 1 form, 2 done
    const [userKind, setUserKind] = useState<UserKind>("COMPANY");
    const [createdCustomer, setCreatedCustomer] = useState<{ customer?: CustomerItem | null } | null>(null);

    const [customerForm] = Form.useForm();

    const openCustomerModal = (options?: { kind?: UserKind; prefill?: Partial<CustomerFormValues>; startStep?: number }) => {
        const nextKind = options?.kind ?? "COMPANY";
        setCustomerModalOpen(true);
        setCustomerStep(options?.startStep ?? 0);
        setUserKind(nextKind);
        setCreatedCustomer(null);
        customerForm.resetFields();
        if (options?.startStep === 1) {
            applyDefaultsForKind(nextKind);
        } else {
            customerForm.setFieldsValue({
                customerType: nextKind,
                outUserId: generateOutUserId(nextKind),
            });
        }
        customerForm.setFieldsValue({
            customerType: nextKind,
            ...options?.prefill,
        });
    };

    const applyDefaultsForKind = (kind: UserKind) => {
        const nextValues: Record<string, unknown> = {
            customerType: kind,
            customerCountryCode: kind === "COMPANY" ? "DE" : "FR",
            outUserId: generateOutUserId(kind),
        };
        customerForm.setFieldsValue(nextValues);
    };

    const goNextFromChoose = () => {
        applyDefaultsForKind(userKind);
        setCustomerStep(1);
    };

    const createCustomerM = useMutation({
        mutationFn: async (v: CustomerFormValues) => {
            const t = (v.customerType ?? userKind ?? "COMPANY").toUpperCase();
            const outUserId = v.outUserId ?? generateOutUserId(t === "COMPANY" ? "COMPANY" : "INDIVIDUAL");

            const payload = {
                out_user_id: outUserId,
                customer_email: v.email,
                customer_type: t,
                country_code: v.customerCountryCode,
            } satisfies CreateCustomerPayload;

            if (t === "COMPANY") {
                payload.company_name = v.companyName;
                payload.registration_number = v.registrationNumber;
                payload.company_representative_name = v.repName;
                payload.company_representative_document_type = v.repDocType;
                payload.company_representative_number = v.repDocNo;

                const docValue = v.registrationNumber;
                if (docValue) {
                    payload.company_document_id = docValue;
                    payload.id_front_side_document_id = docValue;
                    payload.id_back_side_document_id = docValue;
                }
            } else {
                payload.first_name = v.firstName;
                payload.last_name = v.lastName;
                payload.id_document_type = v.idDocumentType;
                payload.id_document_number = v.idDocumentNumber;
            }

            return createCustomer(payload);
        },
        onSuccess: async (res) => {
            msgApi.success("创建成功：用户已提交审核");
            setCreatedCustomer(res);
            setCustomerStep(2);

            await qc.invalidateQueries({ queryKey: ["customers"] });
        },
        onError: (err) => {
            msgApi.error(extractErrorMessage(err, "创建失败"));
        },
    });

    // ---------- Account Modal ----------
    const [accountModalOpen, setAccountModalOpen] = useState(false);
    const [accountModalCustomer, setAccountModalCustomer] = useState<CustomerItem | null>(null);
    const [accountForm] = Form.useForm();

    const resetAccountForm = () => {
        accountForm.resetFields();
    };

    const openAccountModal = (customer: CustomerItem, latestAccount?: AccountItem | null) => {
        setAccountModalCustomer(customer);
        setAccountModalOpen(true);

        const defaults: Record<string, unknown> = {
            currency: "EUR",
            accountCountryCode: customer.countryCode ?? latestAccount?.countryCode ?? "FR",
            addressLine: latestAccount?.addressLine ?? "",
            city: latestAccount?.city ?? "",
            postCode: latestAccount?.postCode ?? "",
            nationality: latestAccount?.nationality ?? customer.countryCode ?? "FR",
        };
        const birthSource = latestAccount?.birthDate;
        if (birthSource) {
            defaults.birthDate = dayjs(birthSource);
        }

        accountForm.setFieldsValue(defaults);
    };

    const closeAccountModal = () => {
        setAccountModalOpen(false);
        setAccountModalCustomer(null);
        resetAccountForm();
    };

    const createAccountM = useMutation({
        mutationFn: async (raw: AccountFormValues) => {
            if (!accountModalCustomer) throw new Error("请选择客户");
            const isCompany = (accountModalCustomer.customerType ?? "").toUpperCase() === "COMPANY";
            const birthDate = typeof raw.birthDate === "string" ? raw.birthDate : raw.birthDate?.format("YYYY-MM-DD");
            const accountCountry = accountModalCustomer.countryCode ?? raw.accountCountryCode;
            const payload: CreateAccountPayload = {
                customer_map_id: accountModalCustomer.id,
                currency: "EUR",
                country_code: accountCountry,
                email: accountModalCustomer.customerEmail,
                company_name: isCompany ? accountModalCustomer.companyName ?? undefined : undefined,
                registration_number: isCompany ? accountModalCustomer.registrationNumber ?? undefined : undefined,
                trading_country: accountCountry,
                trading_address: raw.addressLine,
                trading_city: raw.city,
                nationality: raw.nationality,
                post_code: raw.postCode,
                first_name: !isCompany ? accountModalCustomer.firstName ?? undefined : undefined,
                last_name: !isCompany ? accountModalCustomer.lastName ?? undefined : undefined,
                city: raw.city,
                address_line: raw.addressLine,
                birth_date: birthDate,
            };

            Object.keys(payload).forEach((k) => {
                if (payload[k] === undefined || payload[k] === null || payload[k] === "") {
                    delete payload[k];
                }
            });
            return createAccount(payload);
        },
        onSuccess: async () => {
            msgApi.success("账户创建请求已提交");
            closeAccountModal();
            await Promise.all([
                qc.invalidateQueries({ queryKey: ["accounts"] }),
                qc.invalidateQueries({ queryKey: ["balance-summary"] }),
                qc.invalidateQueries({ queryKey: ["transactions"] }),
                qc.invalidateQueries({ queryKey: ["withdrawals"] }),
            ]);
        },
        onError: (err) => {
            msgApi.error(extractErrorMessage(err, "创建账户失败"));
        },
    });

    const [withdrawModalAccount, setWithdrawModalAccount] = useState<AccountItem | null>(null);
    const [withdrawForm] = Form.useForm<WithdrawalFormValues>();

    const accountMapById = useMemo(() => {
        const map: Record<string, AccountItem> = {};
        filteredAccounts.forEach((acc) => {
            map[acc.id] = acc;
        });
        return map;
    }, [filteredAccounts]);

    const activeAccountOptions = useMemo(() => {
        return filteredAccounts
            .filter((acc) => isActiveAccountStatus(acc.status))
            .map((acc) => ({
                value: acc.id,
                label: `${pickDisplayName(acc)} · ${formatMinor(acc.balanceMinor, acc.balanceCurrency ?? acc.currency ?? "UNKNOWN")}`,
            }));
    }, [filteredAccounts]);

    const openWithdrawModal = (account: AccountItem) => {
        setWithdrawModalAccount(account);
        withdrawForm.setFieldsValue({
            accountMapId: account.id,
            tronAddress: undefined,
            amount: "0",
        });
    };

    const closeWithdrawModal = () => {
        setWithdrawModalAccount(null);
        withdrawForm.resetFields();
    };

    const withdrawM = useMutation({
        mutationFn: async (values: WithdrawalFormValues) => {
            const accountId = values.accountMapId || withdrawModalAccount?.id;
            if (!accountId) throw new Error("未选择账户");
            const account = accountMapById[accountId];
            if (!account) throw new Error("未选择账户");
            const amountInput = typeof values.amount === "number" ? values.amount.toString() : (values.amount ?? "").trim();
            if (!amountInput) throw new Error("请输入金额");
            const amountMinor = decimalToMinor(amountInput);
            return createWithdrawal({
                accountMapId: account.id,
                tronAddress: values.tronAddress,
                amountMinor,
            });
        },
        onSuccess: async () => {
            msgApi.success("提现申请已提交");
            closeWithdrawModal();
            await Promise.all([
                qc.invalidateQueries({ queryKey: ["accounts"] }),
                qc.invalidateQueries({ queryKey: ["withdrawals"] }),
            ]);
        },
        onError: (err) => {
            msgApi.error(extractErrorMessage(err, "提现失败"));
        },
    });

    // ---------- Accounts columns ----------
    const customerColumns: ColumnsType<CustomerRow> = [
        {
            title: "姓名 / 公司名",
            key: "customer",
            width: 260,
            render: (_, record) => (
                <Space direction="vertical" size={0}>
                    <Typography.Text>{pickCustomerDisplayName(record.customer)}</Typography.Text>
                </Space>
            ),
        },
        {
            title: "类型",
            key: "kind",
            width: 120,
            render: (_, record) => <Tag>{(record.customer.customerType ?? "-").toUpperCase()}</Tag>,
        },
        {
            title: "邮箱",
            key: "email",
            width: 260,
            render: (_, record) => <Typography.Text>{record.customer.customerEmail}</Typography.Text>,
        },
        {
            title: "客户状态",
            key: "status",
            width: 200,
            render: (_, record) => (
                <Space size={8}>
                    {renderStatus(record.customer.status)}
                    {record.customer.sunpayStatus ? <Tag color="purple">{record.customer.sunpayStatus}</Tag> : null}
                </Space>
            ),
        },
        {
            title: "账户与余额",
            key: "accountSummary",
            render: (_, record) => {
                if (!record.accounts.length) {
                    return <Typography.Text type="secondary">暂无账户</Typography.Text>;
                }
                const visible = record.accounts.slice(0, 2);
                return (
                    <Space direction="vertical" size={6} style={{ width: "100%" }}>
                        {visible.map((acc) => {
                            const ccy = acc.balanceCurrency ?? acc.currency ?? "UNKNOWN";
                            return (
                                <Space key={acc.id} wrap>
                                    {renderStatus(acc.status)}
                                    <Typography.Text strong>{formatMinor(acc.balanceMinor, ccy)}</Typography.Text>
                                    <Tag>{ccy}</Tag>
                                </Space>
                            );
                        })}
                        {record.accounts.length > 2 ? (
                            <Typography.Text type="secondary">+{record.accounts.length - 2} 更多</Typography.Text>
                        ) : null}
                    </Space>
                );
            },
        },
        {
            title: "操作",
            key: "actions",
            width: 280,
            render: (_, record) => {
                const cStatus = record.customer.status;
                const accountActions = record.accounts.length
                    ? record.accounts.map((acc) => (
                          <Space key={acc.id} wrap>
                              {/* <Typography.Text type="secondary">{pickDisplayName(acc)}</Typography.Text> */}
                              <Button
                                  size="small"
                                  onClick={() => {
                                      setDetailAccount(acc);
                                      setDetailOpen(true);
                                  }}
                              >
                                  详情
                              </Button>
                              {isActiveAccountStatus(acc.status) ? (
                                  <Button size="small" type="primary" onClick={() => openWithdrawModal(acc)} disabled={!hasWithdrawalAddresses}>
                                      提现
                                  </Button>
                              ) : null}
                          </Space>
                      ))
                    : null;

                if (isReviewingStatus(cStatus)) {
                    return <Typography.Text type="secondary">审核中</Typography.Text>;
                }
                if (isRejectedStatus(cStatus)) {
                    const kind = (record.customer.customerType?.toUpperCase() === "INDIVIDUAL" ? "INDIVIDUAL" : "COMPANY") as UserKind;
                    return (
                        <Space direction="vertical" size={8}>
                            <Button
                                size="small"
                                type="primary"
                                disabled={createCustomerM.isPending}
                                onClick={() => {
                                    const prefill: Partial<CustomerFormValues> = {
                                        email: record.customer.customerEmail,
                                    };
                                    if (record.customer.countryCode) {
                                        prefill.customerCountryCode = record.customer.countryCode;
                                    }
                                    openCustomerModal({
                                        kind,
                                        startStep: 1,
                                        prefill,
                                    });
                                }}
                            >
                                重新提交用户
                            </Button>
                            {accountActions}
                        </Space>
                    );
                }
                if (isApprovedStatus(cStatus)) {
                    return (
                        <Space direction="vertical" size={8} style={{ width: "100%" }}>
                            {!record.hasActiveAccount ? (
                                <Button
                                    size="small"
                                    type="primary"
                                    disabled={createAccountM.isPending}
                                    onClick={() => openAccountModal(record.customer, record.latestAccount)}
                                >
                                    {record.accounts.length ? "重新提交账户" : "创建账户"}
                                </Button>
                            ) : null}
                            {accountActions}
                        </Space>
                    );
                }
                return (
                    <Space direction="vertical" size={8}>
                        <Typography.Text type="secondary">-</Typography.Text>
                        {accountActions}
                    </Space>
                );
            },
        },
    ];

    // ---------- Expanded tabs ----------
    const depositColumns: ColumnsType<DepositRow> = [
        {
            title: "账户",
            key: "account",
            width: 220,
            render: (_, r) => <Typography.Text>{r.accountLabel ?? "-"}</Typography.Text>,
        },
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

    const withdrawColumns: ColumnsType<WithdrawRow> = [
        {
            title: "账户",
            key: "account",
            width: 220,
            render: (_, r) => <Typography.Text>{r.accountLabel ?? "-"}</Typography.Text>,
        },
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
            render: (v?: string) => (v ? new Date(v).toLocaleString() : "-"),
        },
    ];

    const renderCustomerActivity = (record: CustomerRow) => {
        if (!record.accounts.length) {
            return <Typography.Text type="secondary">暂无账户，无法展示交易记录</Typography.Text>;
        }

        const labelBySunpayId = new Map<string, string>();
        const labelByAccountId = new Map<string, string>();
        record.accounts.forEach((acc) => {
            const label = formatAccountLabel(acc);
            if (acc.sunpayAccountId) labelBySunpayId.set(acc.sunpayAccountId, label);
            labelByAccountId.set(acc.id, label);
        });

        const deposits: DepositRow[] = txItems
            .filter((t) => t.recipientAccountId && labelBySunpayId.has(t.recipientAccountId))
            .sort((a, b) => new Date(b.receivedAt ?? 0).getTime() - new Date(a.receivedAt ?? 0).getTime())
            .map((item) => ({
                ...item,
                accountLabel: item.recipientAccountId ? labelBySunpayId.get(item.recipientAccountId) : undefined,
            }));

        const withdraws: WithdrawRow[] = wdItems
            .filter((w) => labelByAccountId.has(w.accountMapId))
            .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
            .map((item) => ({
                ...item,
                accountLabel: labelByAccountId.get(item.accountMapId),
            }));

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
                                scroll={{ x: 960 }}
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
                                scroll={{ x: 960 }}
                            />
                        ),
                    },
                ]}
            />
        );
    };

    const hasDbBankInfo =
        !!detailAccount &&
        Boolean(
            detailAccount.iban ||
                detailAccount.swiftBic ||
                detailAccount.accountNumber ||
                detailAccount.bankCountry ||
                detailAccount.bankAddress ||
                detailAccount.bankName ||
                detailAccount.bankAccountHolderName ||
                detailAccount.routingCodeEntries ||
                detailAccount.depositInstructions,
        );

    // ---------- Create modal footer (smooth) ----------
    const modalFooter =
        customerStep === 0
            ? [
                <Button key="cancel" onClick={() => setCustomerModalOpen(false)}>
                    取消
                </Button>,
                <Button key="next" type="primary" onClick={goNextFromChoose}>
                    下一步
                </Button>,
            ]
            : customerStep === 1
                ? [
                    <Button key="back" onClick={() => setCustomerStep(0)} disabled={createCustomerM.isPending}>
                        上一步
                    </Button>,
                    <Button key="cancel" onClick={() => setCustomerModalOpen(false)} disabled={createCustomerM.isPending}>
                        取消
                    </Button>,
                    <Button
                        key="submit"
                        type="primary"
                        loading={createCustomerM.isPending}
                        onClick={() => customerForm.submit()}
                    >
                        提交审核
                    </Button>,
                ]
                : [
                    <Button
                        key="close"
                        type="primary"
                        onClick={() => {
                            setCustomerModalOpen(false);
                            setCustomerStep(0);
                        }}
                    >
                        完成
                    </Button>,
                ];

    return (
        <>
            {ctxHolder}
            <Space orientation="vertical" size={16} style={{ width: "100%" }}>
                <Card>
                    <Space style={{ width: "100%", justifyContent: "space-between" }}>
                        <div>
                            <Typography.Title level={4} style={{ marginTop: 0 }}>
                                客户与账户管理
                            </Typography.Title>
                            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                                先创建/审核客户，再为已审核客户创建账户。被拒绝的记录如有新提交自动隐藏。
                            </Typography.Paragraph>
                        </div>

                        <Button type="primary" onClick={() => openCustomerModal()}>
                            创建用户
                        </Button>
                    </Space>
                </Card>

                <Card>
                    <Typography.Title level={5} style={{ marginTop: 0 }}>
                        客户列表
                    </Typography.Title>
                    <Typography.Paragraph type="secondary" style={{ marginTop: 4 }}>
                        审核中客户不可操作；被拒绝可重新提交；已审核客户无激活账户时可创建或重新提交账户。展开行可查看该客户下所有账户及交易详情。
                    </Typography.Paragraph>
                    <Table
                        rowKey="key"
                        loading={customersQ.isLoading || accountsQ.isLoading || txQ.isLoading || wdQ.isLoading}
                        columns={customerColumns}
                        dataSource={customerRows}
                        pagination={{ pageSize: 10 }}
                        scroll={{ x: 1200 }}
                        expandable={{
                            expandedRowRender: renderCustomerActivity,
                            rowExpandable: (record) => record.accounts.length > 0,
                            columnWidth: 48,
                        }}
                    />
                </Card>
            </Space>

            {/* ✅ Customer modal */}
            <Modal
                title="创建 / 提交用户"
                open={customerModalOpen}
                onCancel={() => setCustomerModalOpen(false)}
                footer={modalFooter}
                width={780}
                destroyOnHidden
            >
                <Steps
                    current={customerStep}
                    items={[
                        { title: "选择类型" },
                        { title: "填写信息" },
                        { title: "完成" },
                    ]}
                />

                <Divider />

                {customerStep === 0 ? (
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

                {customerStep === 1 ? (
                    <Form
                        form={customerForm}
                        layout="vertical"
                        onFinish={(v) => {
                            v.customerType = userKind;
                            createCustomerM.mutate(v);
                        }}
                    >
                        <Form.Item name="customerType" hidden>
                            <Input />
                        </Form.Item>
                        <Form.Item name="outUserId" hidden>
                            <Input />
                        </Form.Item>

                        <Typography.Title level={5}>基本信息</Typography.Title>
                        <Space wrap size={16} style={{ width: "100%" }}>
                            <Form.Item label="邮箱" name="email" rules={[{ required: true, type: "email" }]} style={{ minWidth: 260 }}>
                                <Input />
                            </Form.Item>

                            <Form.Item label="国别（country_code）" name="customerCountryCode" rules={[{ required: true }]} style={{ minWidth: 220 }}>
                                <Select
                                    showSearch
                                    options={COUNTRY_OPTIONS}
                                    filterOption={countryFilterOption}
                                    placeholder="请选择国家"
                                />
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
                                    <Form.Item label="代表证件类型" name="repDocType" rules={[{ required: true }]} style={{ minWidth: 220 }}>
                                        <Select options={DOCUMENT_TYPE_OPTIONS} placeholder="请选择证件类型" />
                                    </Form.Item>
                                    <Form.Item label="代表证件号" name="repDocNo" rules={[{ required: true }]} style={{ minWidth: 260 }}>
                                        <Input />
                                    </Form.Item>
                                </Space>
                            </>
                        ) : (
                            <>
                                <Typography.Title level={5}>个人信息</Typography.Title>
                                <Space wrap size={16} style={{ width: "100%" }}>
                                    <Form.Item
                                        label="名（first_name）"
                                        name="firstName"
                                        rules={[
                                            { required: true, message: "请输入名" },
                                            { validator: buildMultiWordValidator("名（first_name）") },
                                        ]}
                                        style={{ minWidth: 220 }}
                                    >
                                        <Input />
                                    </Form.Item>
                                    <Form.Item
                                        label="姓（last_name）"
                                        name="lastName"
                                        rules={[
                                            { required: true, message: "请输入姓" },
                                            { validator: buildMultiWordValidator("姓（last_name）") },
                                        ]}
                                        style={{ minWidth: 220 }}
                                    >
                                        <Input />
                                    </Form.Item>
                                    <Form.Item label="证件类型" name="idDocumentType" rules={[{ required: true }]} style={{ minWidth: 220 }}>
                                        <Select options={DOCUMENT_TYPE_OPTIONS} placeholder="请选择证件类型" />
                                    </Form.Item>
                                        <Form.Item label="证件号码" name="idDocumentNumber" rules={[{ required: true }]} style={{ minWidth: 220 }}>
                                        <Input />
                                    </Form.Item>
                                </Space>
                            </>
                        )}
                    </Form>
                ) : null}

                {customerStep === 2 ? (
                    <Card>
                        <Typography.Title level={5} style={{ marginTop: 0 }}>
                            提交完成
                        </Typography.Title>

                        <Descriptions size="small" column={1} bordered>
                            <Descriptions.Item label="用户类型">{userKind === "COMPANY" ? "企业" : "个人"}</Descriptions.Item>
                            <Descriptions.Item label="当前状态">
                                {createdCustomer?.customer?.status ?? "REVIEWING"}
                            </Descriptions.Item>
                            <Descriptions.Item label="提示">请等待审核结果，审核通过后可为该用户创建账户。</Descriptions.Item>
                        </Descriptions>
                    </Card>
                ) : null}
            </Modal>

            <Modal
                title={
                    accountModalCustomer
                        ? `为 ${pickCustomerDisplayName(accountModalCustomer)} 创建账户`
                        : "创建账户"
                }
                open={accountModalOpen}
                onCancel={closeAccountModal}
                footer={[
                    <Button key="cancel" onClick={closeAccountModal} disabled={createAccountM.isPending}>
                        取消
                    </Button>,
                    <Button
                        key="submit"
                        type="primary"
                        loading={createAccountM.isPending}
                        onClick={() => accountForm.submit()}
                    >
                        提交开户
                    </Button>,
                ]}
                width={900}
                destroyOnClose
            >
                {accountModalCustomer ? (
                    <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
                        客户邮箱：{accountModalCustomer.customerEmail}
                    </Typography.Paragraph>
                ) : null}

                <Form
                    form={accountForm}
                    layout="vertical"
                    onFinish={(values) => createAccountM.mutate(values)}
                >
                    <Space wrap size={16} style={{ width: "100%" }}>
                        <Form.Item label="币种" name="currency" rules={[{ required: true }]} style={{ minWidth: 160 }}>
                            <Input disabled />
                        </Form.Item>
                        <Form.Item label="账户国别（country_code）" name="accountCountryCode" rules={[{ required: true }]} style={{ minWidth: 220 }}>
                            <Input disabled />
                        </Form.Item>
                    </Space>

                    <Typography.Title level={5}>身份信息</Typography.Title>
                    <Space wrap size={16} style={{ width: "100%" }}>
                        <Form.Item label="国籍（nationality）" name="nationality" rules={[{ required: true }]} style={{ minWidth: 220 }}>
                            <Select
                                showSearch
                                options={COUNTRY_OPTIONS}
                                filterOption={countryFilterOption}
                                placeholder="请选择国籍"
                            />
                        </Form.Item>
                        <Form.Item label="出生日期（birth_date）" name="birthDate" rules={[{ required: true }]} style={{ minWidth: 240 }}>
                            <DatePicker format="YYYY-MM-DD" style={{ width: 220 }} />
                        </Form.Item>
                    </Space>

                    <Typography.Title level={5}>地址信息</Typography.Title>
                    <Space wrap size={16} style={{ width: "100%" }}>
                        <Form.Item label="地址（address_line）" name="addressLine" rules={[{ required: true }]} style={{ minWidth: 360 }}>
                            <Input />
                        </Form.Item>
                        <Form.Item label="城市（city）" name="city" rules={[{ required: true }]} style={{ minWidth: 220 }}>
                            <Input />
                        </Form.Item>
                        <Form.Item label="邮编（post_code）" name="postCode" rules={[{ required: true }]} style={{ minWidth: 200 }}>
                            <Input />
                        </Form.Item>
                    </Space>

                </Form>
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

                        <Card size="small" title="银行账户信息">
                            {hasDbBankInfo ? (
                                <Descriptions size="small" column={1}>
                                    <Descriptions.Item label="IBAN">{detailAccount.iban ?? "-"}</Descriptions.Item>
                                    <Descriptions.Item label="SWIFT/BIC">{detailAccount.swiftBic ?? "-"}</Descriptions.Item>
                                    <Descriptions.Item label="Account Number">{detailAccount.accountNumber ?? "-"}</Descriptions.Item>
                                    <Descriptions.Item label="Bank Country">{detailAccount.bankCountry ?? "-"}</Descriptions.Item>
                                    <Descriptions.Item label="Bank Name">{detailAccount.bankName ?? "-"}</Descriptions.Item>
                                    <Descriptions.Item label="Bank Address">{detailAccount.bankAddress ?? "-"}</Descriptions.Item>
                                    <Descriptions.Item label="Account Holder">{detailAccount.bankAccountHolderName ?? "-"}</Descriptions.Item>
                                    {/* <Descriptions.Item label="Routing Codes">{detailAccount.routingCodeEntries ?? "-"}</Descriptions.Item>
                                    <Descriptions.Item label="Deposit Instructions">{detailAccount.depositInstructions ?? "-"}</Descriptions.Item> */}
                                </Descriptions>
                            ) : (
                                <Typography.Text type="secondary">暂无银行账户信息</Typography.Text>
                            )}
                        </Card>
                    </Space>
                ) : null}
            </Drawer>

            <Modal
                title="提交提现申请"
                open={!!withdrawModalAccount}
                onCancel={closeWithdrawModal}
                footer={[
                    <Button key="cancel" onClick={closeWithdrawModal} disabled={withdrawM.isPending}>
                        取消
                    </Button>,
                    <Button
                        key="submit"
                        type="primary"
                        loading={withdrawM.isPending}
                        disabled={!hasWithdrawalAddresses}
                        onClick={() => withdrawForm.submit()}
                    >
                        提交
                    </Button>,
                ]}
                destroyOnClose
            >
                {withdrawModalAccount ? (
                    <Space direction="vertical" style={{ width: "100%" }} size={12}>
                        <Descriptions column={1} size="small" bordered>
                            <Descriptions.Item label="账户持有人">{pickDisplayName(withdrawModalAccount)}</Descriptions.Item>
                            <Descriptions.Item label="账户余额">
                                {formatMinor(
                                    withdrawModalAccount.balanceMinor,
                                    withdrawModalAccount.balanceCurrency ?? withdrawModalAccount.currency ?? "UNKNOWN",
                                )}
                            </Descriptions.Item>
                        </Descriptions>
                        {!hasWithdrawalAddresses ? (
                            <Typography.Text type="secondary">
                                暂无可用的提现地址，请联系管理员在白名单中配置。
                            </Typography.Text>
                        ) : null}
                        <Form
                            form={withdrawForm}
                            layout="vertical"
                            onFinish={(values) => withdrawM.mutate(values)}
                            initialValues={{ accountMapId: withdrawModalAccount.id, amount: "0" }}
                        >
                            <Form.Item
                                label="提现账户"
                                name="accountMapId"
                                rules={[{ required: true, message: "请选择账户" }]}
                                style={{ marginBottom: 16 }}
                            >
                                <Select
                                    options={
                                        activeAccountOptions.length
                                            ? activeAccountOptions
                                            : [
                                                {
                                                    value: withdrawModalAccount.id,
                                                    label: `${pickDisplayName(withdrawModalAccount)} · ${formatMinor(
                                                        withdrawModalAccount.balanceMinor,
                                                        withdrawModalAccount.balanceCurrency ?? withdrawModalAccount.currency ?? "UNKNOWN",
                                                    )}`,
                                                },
                                            ]
                                    }
                                    placeholder="请选择需要提现的账户"
                                    onChange={(value) => {
                                        const target = accountMapById[value];
                                        if (target) {
                                            setWithdrawModalAccount(target);
                                        }
                                    }}
                                />
                            </Form.Item>

                            <Form.Item
                                label="TRON 地址"
                                name="tronAddress"
                                rules={[{ required: true, message: "请选择 TRON 地址" }]}
                                style={{ marginBottom: 16 }}
                            >
                                <Select
                                    showSearch
                                    placeholder="请选择白名单地址"
                                    options={withdrawalAddressOptions}
                                    filterOption={(input, option) =>
                                        (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                                    }
                                    optionFilterProp="label"
                                    disabled={!hasWithdrawalAddresses}
                                    loading={whitelistQ.isLoading}
                                />
                            </Form.Item>
                            <Form.Item
                                label="提现金额（最多两位小数）"
                                name="amount"
                                rules={[
                                    { required: true, message: "请输入金额" },
                                    {
                                        validator: (_, value) => {
                                            const raw = typeof value === "number" ? value.toString() : (value ?? "").trim();
                                            if (!raw) {
                                                return Promise.reject(new Error("请输入金额"));
                                            }
                                            let minorStr: string;
                                            try {
                                                minorStr = decimalToMinor(raw);
                                            } catch (err) {
                                                return Promise.reject(err instanceof Error ? err : new Error("金额格式不正确"));
                                            }
                                            if (BigInt(minorStr) <= 0n) {
                                                return Promise.reject(new Error("金额需大于 0"));
                                            }
                                            const fallbackId = withdrawModalAccount?.id;
                                            const selectedId = withdrawForm.getFieldValue("accountMapId") ?? fallbackId;
                                            const account = (selectedId && accountMapById[selectedId]) || withdrawModalAccount;
                                            if (!account) {
                                                return Promise.reject(new Error("请选择账户"));
                                            }
                                            if (BigInt(minorStr) > BigInt(account.balanceMinor ?? "0")) {
                                                return Promise.reject(new Error("金额不能超过账户余额"));
                                            }
                                            return Promise.resolve();
                                        },
                                    },
                                ]}
                                style={{ marginBottom: 0 }}
                            >
                                <Input
                                    placeholder="请输入金额，最多两位小数"
                                    disabled={!hasWithdrawalAddresses}
                                    style={{ width: "100%" }}
                                    inputMode="decimal"
                                />
                            </Form.Item>
                        </Form>
                    </Space>
                ) : null}
            </Modal>
        </>
    );
}
type WithdrawalFormValues = {
    accountMapId?: string;
    tronAddress: string;
    amount?: string | number;
};
