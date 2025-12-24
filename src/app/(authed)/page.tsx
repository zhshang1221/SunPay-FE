"use client";

import { Card, Col, Row, Space, Statistic, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAccounts, fetchBalanceSummary, fetchTransactions, fetchWithdrawals } from "@/lib/api";
import { formatMinor } from "@/lib/money";
import type { AccountItem, TransactionEventItem, WithdrawalItem } from "@/lib/types";

const REFRESH_MS = 60_000; // ✅ 1分钟

function renderStatus(s?: string | null) {
    if (!s) return <Tag>UNKNOWN</Tag>;
    const v = String(s).toUpperCase();
    if (v.includes("SUBMIT") || v.includes("REVIEW") || v.includes("PENDING")) return <Tag color="blue">{s}</Tag>;
    if (v.includes("SUCCESS") || v.includes("APPROV") || v.includes("ACTIVE")) return <Tag color="green">{s}</Tag>;
    if (v.includes("FAIL") || v.includes("REJECT") || v.includes("ERROR")) return <Tag color="red">{s}</Tag>;
    return <Tag>{s}</Tag>;
}

function displayName(a: AccountItem) {
    const cm = a.customerMap;
    if (!cm) return "-";
    const t = (cm.customerType ?? "").toUpperCase();
    if (t === "COMPANY") return (cm as any).companyName || (cm as any).displayName || cm.outUserId || "-";
    const name = [(cm as any).firstName, (cm as any).lastName].filter(Boolean).join(" ").trim();
    return name || (cm as any).displayName || cm.outUserId || "-";
}

function toMs(d: any): number {
    const t = new Date(d ?? 0).getTime();
    return Number.isFinite(t) ? t : 0;
}

function bigint(v: any): bigint {
    try {
        if (typeof v === "bigint") return v;
        if (typeof v === "number") return BigInt(Math.trunc(v));
        if (typeof v === "string" && v.trim() !== "") return BigInt(v);
    } catch { }
    return 0n;
}

function trendTag(now: bigint, prev: bigint) {
    const diff = now - prev;
    if (diff === 0n) return <Tag>0%</Tag>;
    if (prev === 0n) return diff > 0n ? <Tag color="green">↑</Tag> : <Tag color="red">↓</Tag>;
    const p = Number(diff) / Number(prev) * 100;
    const txt = `${diff > 0n ? "↑" : "↓"} ${Math.abs(p).toFixed(2)}%`;
    return <Tag color={diff > 0n ? "green" : "red"}>{txt}</Tag>;
}

function dayKey(ts: number) {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const dd = `${d.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${dd}`;
}

export default function DashboardPage() {
    const accountsQ = useQuery({
        queryKey: ["accounts"],
        queryFn: fetchAccounts,
        refetchInterval: REFRESH_MS,
    });

    const balanceQ = useQuery({
        queryKey: ["balance-summary"],
        queryFn: fetchBalanceSummary,
        refetchInterval: REFRESH_MS,
    });

    // ✅ take 最大 200：这里改成 200
    const txQ = useQuery({
        queryKey: ["transactions", 200],
        queryFn: () => fetchTransactions(200),
        refetchInterval: REFRESH_MS,
    });

    const wdQ = useQuery({
        queryKey: ["withdrawals", 200],
        queryFn: () => fetchWithdrawals(200),
        refetchInterval: REFRESH_MS,
    });

    const loading = accountsQ.isLoading || balanceQ.isLoading || txQ.isLoading || wdQ.isLoading;

    const accounts: AccountItem[] = accountsQ.data?.items ?? [];
    const txs: TransactionEventItem[] = txQ.data?.items ?? [];
    const wds: WithdrawalItem[] = (wdQ.data?.items ?? []) as any;

    const bySunpayAccountId = useMemo(() => {
        const m = new Map<string, AccountItem>();
        for (const a of accounts) m.set(a.sunpayAccountId, a);
        return m;
    }, [accounts]);

    const byAccountMapId = useMemo(() => {
        const m = new Map<string, AccountItem>();
        for (const a of accounts) m.set(a.id, a);
        return m;
    }, [accounts]);

    // ---- primary currency ----
    const primaryCurrency = useMemo(() => {
        const byCurrencyMinor: Record<string, string> = balanceQ.data?.byCurrency ?? {};
        if (byCurrencyMinor["EUR"] != null || byCurrencyMinor["eur"] != null) return "EUR";
        const first = Object.keys(byCurrencyMinor)[0];
        return (first || "EUR").toUpperCase();
    }, [balanceQ.data]);

    // ---- KPI windows ----
    const now = Date.now();
    const d7 = 7 * 24 * 60 * 60 * 1000;
    const since7d = now - d7;
    const prev7dStart = now - 2 * d7; // 14 days ago
    const prev7dEnd = since7d;

    const sumDepositInRange = useMemo(() => {
        return (start: number, end: number) => {
            let s = 0n;
            for (const t of txs) {
                const ts = toMs(t.receivedAt);
                if (ts < start || ts >= end) continue;
                const ccy = (t.settlementCurrency ?? "UNKNOWN").toUpperCase();
                if (ccy !== primaryCurrency) continue;
                s += bigint(t.settlementAmount ?? "0");
            }
            return s;
        };
    }, [txs, primaryCurrency]);

    const sumWithdrawInRange = useMemo(() => {
        return (start: number, end: number) => {
            let s = 0n;
            for (const w of wds as any[]) {
                const ts = toMs(w.createdAt);
                if (ts < start || ts >= end) continue;
                const ccy = (w.currency ?? "UNKNOWN").toUpperCase();
                if (ccy !== primaryCurrency) continue;
                s += bigint(w.amountMinor ?? "0");
            }
            return s;
        };
    }, [wds, primaryCurrency]);

    const dep7 = sumDepositInRange(since7d, now);
    const depPrev7 = sumDepositInRange(prev7dStart, prev7dEnd);

    const wd7 = sumWithdrawInRange(since7d, now);
    const wdPrev7 = sumWithdrawInRange(prev7dStart, prev7dEnd);

    const net7 = dep7 - wd7;
    const netPrev7 = depPrev7 - wdPrev7;

    const activeAccountsCount = useMemo(() => {
        return accounts.filter((a) => {
            const s = String(a.status ?? "").toUpperCase();
            return s.includes("ACTIVE") || s.includes("APPROV") || s.includes("SUCCESS");
        }).length;
    }, [accounts]);

    // ---- totals by currency ----
    const byCurrencyMinor: Record<string, string> = balanceQ.data?.byCurrency ?? {};
    const balanceEntries = useMemo(() => {
        return Object.entries(byCurrencyMinor)
            .map(([ccy, minor]) => ({ currency: ccy.toUpperCase(), minor: String(minor ?? "0") }))
            .sort((a, b) => (bigint(b.minor) > bigint(a.minor) ? 1 : -1));
    }, [byCurrencyMinor]);

    // ---- recent lists ----
    const recentDeposits = useMemo(() => {
        return [...txs].sort((a, b) => toMs(b.receivedAt) - toMs(a.receivedAt)).slice(0, 10);
    }, [txs]);

    const recentWithdraws = useMemo(() => {
        return [...(wds as any[])].sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt)).slice(0, 10);
    }, [wds]);

    // ---- Top accounts by balance ----
    const topAccounts = useMemo(() => {
        const sorted = [...accounts].sort((a, b) => {
            const aa = bigint(a.balanceMinor);
            const bb = bigint(b.balanceMinor);
            if (bb === aa) return 0;
            return bb > aa ? 1 : -1;
        });
        return sorted.slice(0, 10);
    }, [accounts]);

    // ---- 14d daily summary (primary currency) ----
    const daily14 = useMemo(() => {
        const start = now - 14 * 24 * 60 * 60 * 1000;
        const depByDay = new Map<string, bigint>();
        const wdByDay = new Map<string, bigint>();

        for (const t of txs) {
            const ts = toMs(t.receivedAt);
            if (ts < start) continue;
            const ccy = (t.settlementCurrency ?? "UNKNOWN").toUpperCase();
            if (ccy !== primaryCurrency) continue;
            const k = dayKey(ts);
            depByDay.set(k, (depByDay.get(k) ?? 0n) + bigint(t.settlementAmount ?? "0"));
        }

        for (const w of wds as any[]) {
            const ts = toMs(w.createdAt);
            if (ts < start) continue;
            const ccy = (w.currency ?? "UNKNOWN").toUpperCase();
            if (ccy !== primaryCurrency) continue;
            const k = dayKey(ts);
            wdByDay.set(k, (wdByDay.get(k) ?? 0n) + bigint(w.amountMinor ?? "0"));
        }

        const rows: any[] = [];
        for (let i = 13; i >= 0; i--) {
            const ts = now - i * 24 * 60 * 60 * 1000;
            const k = dayKey(ts);
            const dep = depByDay.get(k) ?? 0n;
            const wd = wdByDay.get(k) ?? 0n;
            rows.push({
                day: k,
                deposit: dep.toString(),
                withdraw: wd.toString(),
                net: (dep - wd).toString(),
            });
        }
        return rows;
    }, [txs, wds, now, primaryCurrency]);

    const dailyCols: ColumnsType<any> = [
        { title: "日期", dataIndex: "day", key: "day", width: 140 },
        {
            title: "存款",
            dataIndex: "deposit",
            key: "deposit",
            width: 220,
            render: (v) => <Typography.Text strong>{formatMinor(v, primaryCurrency)}</Typography.Text>,
        },
        {
            title: "提现",
            dataIndex: "withdraw",
            key: "withdraw",
            width: 220,
            render: (v) => <Typography.Text strong>{formatMinor(v, primaryCurrency)}</Typography.Text>,
        },
        {
            title: "净流入",
            dataIndex: "net",
            key: "net",
            width: 220,
            render: (v) => {
                const n = bigint(v);
                return (
                    <Typography.Text strong type={n < 0n ? "danger" : undefined}>
                        {formatMinor(v, primaryCurrency)}
                    </Typography.Text>
                );
            },
        },
    ];

    // ---- columns: recent deposits / withdrawals (no type) ----
    const depositCols: ColumnsType<TransactionEventItem> = [
        {
            title: "用户",
            key: "user",
            width: 200,
            render: (_, r) => {
                const acc = r.recipientAccountId ? bySunpayAccountId.get(r.recipientAccountId) : undefined;
                return <Typography.Text>{acc ? displayName(acc) : "-"}</Typography.Text>;
            },
        },
        {
            title: "邮箱",
            key: "email",
            width: 240,
            render: (_, r) => {
                const acc = r.recipientAccountId ? bySunpayAccountId.get(r.recipientAccountId) : undefined;
                return <Typography.Text>{acc?.customerMap?.customerEmail ?? "-"}</Typography.Text>;
            },
        },
        {
            title: "账户",
            key: "account",
            width: 260,
            render: (_, r) => {
                const acc = r.recipientAccountId ? bySunpayAccountId.get(r.recipientAccountId) : undefined;
                return <Typography.Text>{acc?.sunpayAccountId ?? r.recipientAccountId ?? "-"}</Typography.Text>;
            },
        },
        {
            title: "订单号",
            key: "orderNo",
            width: 220,
            render: (_, r) => <Typography.Text copyable>{r.orderNo ?? r.reference ?? "-"}</Typography.Text>,
        },
        {
            title: "金额",
            key: "amt",
            width: 160,
            render: (_, r) => (
                <Typography.Text strong>
                    {formatMinor(r.settlementAmount ?? "0", r.settlementCurrency ?? "UNKNOWN")}
                </Typography.Text>
            ),
        },
        {
            title: "时间",
            dataIndex: "receivedAt",
            key: "receivedAt",
            width: 180,
            render: (v) => (v ? new Date(v).toLocaleString() : "-"),
        },
    ];

    const withdrawCols: ColumnsType<WithdrawalItem> = [
        {
            title: "用户",
            key: "user",
            width: 200,
            render: (_, r) => {
                const acc = byAccountMapId.get((r as any).accountMapId);
                return <Typography.Text>{acc ? displayName(acc) : "-"}</Typography.Text>;
            },
        },
        {
            title: "邮箱",
            key: "email",
            width: 240,
            render: (_, r) => {
                const acc = byAccountMapId.get((r as any).accountMapId);
                return <Typography.Text>{acc?.customerMap?.customerEmail ?? "-"}</Typography.Text>;
            },
        },
        {
            title: "账户",
            key: "account",
            width: 260,
            render: (_, r) => {
                const acc = byAccountMapId.get((r as any).accountMapId);
                return <Typography.Text>{acc?.sunpayAccountId ?? (r as any).accountMapId}</Typography.Text>;
            },
        },
        {
            title: "订单号",
            key: "orderNo",
            width: 220,
            render: (_, r) => <Typography.Text copyable>{(r as any).id}</Typography.Text>,
        },
        {
            title: "金额",
            key: "amt",
            width: 160,
            render: (_, r) => (
                <Typography.Text strong>
                    {formatMinor((r as any).amountMinor, (r as any).currency)}
                </Typography.Text>
            ),
        },
        {
            title: "时间",
            dataIndex: "createdAt",
            key: "createdAt",
            width: 180,
            render: (v: any) => (v ? new Date(v).toLocaleString() : "-"),
        },
    ];

    const topCols: ColumnsType<AccountItem> = [
        { title: "用户", key: "user", width: 200, render: (_, r) => <Typography.Text>{displayName(r)}</Typography.Text> },
        { title: "邮箱", key: "email", width: 240, render: (_, r) => <Typography.Text>{r.customerMap?.customerEmail ?? "-"}</Typography.Text> },
        { title: "账户", key: "acc", width: 280, render: (_, r) => <Typography.Text>{r.sunpayAccountId}</Typography.Text> },
        {
            title: "余额",
            key: "bal",
            width: 200,
            render: (_, r) => (
                <Typography.Text strong>
                    {formatMinor(r.balanceMinor, r.balanceCurrency ?? r.currency ?? "UNKNOWN")}
                </Typography.Text>
            ),
        },
        { title: "状态", dataIndex: "status", key: "status", width: 140, render: (v) => renderStatus(v) },
    ];

    return (
        <Space orientation="vertical" size={16} style={{ width: "100%" }}>
            <Row gutter={16}>
                <Col xs={24} md={6}>
                    <Card>
                        <Statistic title="账户数" value={accounts.length} loading={loading} />
                        <Typography.Text type="secondary">活跃：{activeAccountsCount}</Typography.Text>
                    </Card>
                </Col>

                <Col xs={24} md={6}>
                    <Card>
                        <Space direction="vertical" size={4} style={{ width: "100%" }}>
                            <Space style={{ width: "100%", justifyContent: "space-between" }}>
                                <Typography.Text type="secondary">{`近7天存款（${primaryCurrency}）`}</Typography.Text>
                                {trendTag(dep7, depPrev7)}
                            </Space>
                            <Statistic value={formatMinor(dep7.toString(), primaryCurrency)} loading={loading} />
                            <Typography.Text type="secondary">上一周期：{formatMinor(depPrev7.toString(), primaryCurrency)}</Typography.Text>
                        </Space>
                    </Card>
                </Col>

                <Col xs={24} md={6}>
                    <Card>
                        <Space direction="vertical" size={4} style={{ width: "100%" }}>
                            <Space style={{ width: "100%", justifyContent: "space-between" }}>
                                <Typography.Text type="secondary">{`近7天提现（${primaryCurrency}）`}</Typography.Text>
                                {trendTag(wd7, wdPrev7)}
                            </Space>
                            <Statistic value={formatMinor(wd7.toString(), primaryCurrency)} loading={loading} />
                            <Typography.Text type="secondary">上一周期：{formatMinor(wdPrev7.toString(), primaryCurrency)}</Typography.Text>
                        </Space>
                    </Card>
                </Col>

                <Col xs={24} md={6}>
                    <Card>
                        <Space direction="vertical" size={4} style={{ width: "100%" }}>
                            <Space style={{ width: "100%", justifyContent: "space-between" }}>
                                <Typography.Text type="secondary">{`近7天净流入（${primaryCurrency}）`}</Typography.Text>
                                {trendTag(net7, netPrev7)}
                            </Space>
                            <Statistic
                                value={formatMinor(net7.toString(), primaryCurrency)}
                                loading={loading}
                                valueStyle={net7 < 0n ? { color: "#cf1322" } : undefined}
                            />
                            <Typography.Text type="secondary">上一周期：{formatMinor(netPrev7.toString(), primaryCurrency)}</Typography.Text>
                        </Space>
                    </Card>
                </Col>
            </Row>

            <Card>
                <Typography.Title level={4} style={{ marginTop: 0 }}>
                    代理商总余额（按币种）
                </Typography.Title>
                <Space wrap>
                    {balanceEntries.map((e) => (
                        <Statistic key={e.currency} title={e.currency} value={formatMinor(e.minor, e.currency)} loading={loading} />
                    ))}
                    {balanceEntries.length === 0 ? <Typography.Text type="secondary">暂无余额数据</Typography.Text> : null}
                </Space>
            </Card>

            <Card>
                <Typography.Title level={4} style={{ marginTop: 0 }}>
                    近 14 天每日汇总（{primaryCurrency}）
                </Typography.Title>
                <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
                    存款来自交易回调（Transaction webhook），提现来自提现请求记录。
                </Typography.Paragraph>
                <Table rowKey="day" columns={dailyCols} dataSource={daily14} pagination={false} loading={loading} scroll={{ x: 860 }} />
            </Card>

            <Card>
                <Typography.Title level={4} style={{ marginTop: 0 }}>
                    Top 账户（按余额）
                </Typography.Title>
                <Table rowKey="id" columns={topCols} dataSource={topAccounts} pagination={{ pageSize: 10 }} loading={loading} scroll={{ x: 1100 }} />
            </Card>

            <Row gutter={16}>
                <Col xs={24} lg={12}>
                    <Card>
                        <Typography.Title level={4} style={{ marginTop: 0 }}>
                            最近 10 条存款
                        </Typography.Title>
                        <Table rowKey="id" columns={depositCols} dataSource={recentDeposits} pagination={false} loading={loading} scroll={{ x: 1200 }} />
                    </Card>
                </Col>

                <Col xs={24} lg={12}>
                    <Card>
                        <Typography.Title level={4} style={{ marginTop: 0 }}>
                            最近 10 条提现
                        </Typography.Title>
                        <Table rowKey="id" columns={withdrawCols} dataSource={recentWithdraws} pagination={false} loading={loading} scroll={{ x: 1200 }} />
                    </Card>
                </Col>
            </Row>

            <Typography.Text type="secondary">
                自动刷新：每分钟一次（{REFRESH_MS / 1000}s）
            </Typography.Text>
        </Space>
    );
}
