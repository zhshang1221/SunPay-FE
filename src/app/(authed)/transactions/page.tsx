"use client";

import { Card, Input, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchTransactions } from "@/lib/api";
import { formatMinor } from "@/lib/money";
import type { TransactionEventItem } from "@/lib/types";

export default function TransactionsPage() {
    const [keyword, setKeyword] = useState("");

    const { data, isLoading, error } = useQuery({
        queryKey: ["transactions", 200],
        queryFn: () => fetchTransactions(200),
        refetchInterval: 10_000,
    });

    const rows = useMemo(() => {
        const items = data?.items ?? [];
        const k = keyword.trim().toLowerCase();
        if (!k) return items;
        return items.filter((r) => {
            const s = [
                r.bizType,
                r.bizStatus,
                r.orderNo,
                r.reference,
                r.outUserId,
                r.recipientAccountId,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return s.includes(k);
        });
    }, [data, keyword]);

    const columns: ColumnsType<TransactionEventItem> = [
        { title: "业务类型", dataIndex: "bizType", key: "bizType", width: 180, render: (v) => <Tag>{v}</Tag> },
        { title: "状态", dataIndex: "bizStatus", key: "bizStatus", width: 120, render: (v) => <Tag color={String(v).includes("SUCCESS") ? "green" : "blue"}>{v}</Tag> },
        { title: "订单号", dataIndex: "orderNo", key: "orderNo", width: 220, render: (v) => (v ? <Typography.Text copyable>{v}</Typography.Text> : "-") },
        { title: "Reference", dataIndex: "reference", key: "reference", width: 240, render: (v) => (v ? <Typography.Text copyable>{v}</Typography.Text> : "-") },
        {
            title: "到账金额",
            key: "amount",
            width: 180,
            render: (_, r) => {
                const c = r.settlementCurrency ?? "UNKNOWN";
                const a = r.settlementAmount ?? "0";
                return <Typography.Text strong>{formatMinor(a, c)}</Typography.Text>;
            },
        },
        { title: "收款账户ID", dataIndex: "recipientAccountId", key: "recipientAccountId", width: 260, render: (v) => (v ? <Typography.Text copyable>{v}</Typography.Text> : "-") },
        { title: "接收时间", dataIndex: "receivedAt", key: "receivedAt", width: 200, render: (v) => (v ? new Date(v).toLocaleString() : "-") },
    ];

    return (
        <Space orientation="vertical" size={16} style={{ width: "100%" }}>
            <Card>
                <Space orientation="vertical" size={8} style={{ width: "100%" }}>
                    <Typography.Title level={4} style={{ marginTop: 0 }}>
                        到账记录
                    </Typography.Title>
                    <Input.Search
                        placeholder="搜索 orderNo / reference / outUserId / accountId ..."
                        allowClear
                        onSearch={(v) => setKeyword(v)}
                        onChange={(e) => setKeyword(e.target.value)}
                    />
                </Space>
            </Card>

            <Card>
                {error ? (
                    <Typography.Text type="danger">加载失败：{(error as any)?.message ?? "unknown error"}</Typography.Text>
                ) : (
                    <Table
                        rowKey="id"
                        loading={isLoading}
                        columns={columns}
                        dataSource={rows}
                        pagination={{ pageSize: 10 }}
                        scroll={{ x: 1300 }}
                    />
                )}
            </Card>
        </Space>
    );
}
