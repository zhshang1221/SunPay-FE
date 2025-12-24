"use client";

import React, { useMemo, useState } from "react";
import { Layout, Menu, Button, Typography } from "antd";
import {
    DashboardOutlined,
    WalletOutlined,
    SwapOutlined,
    LogoutOutlined,
} from "@ant-design/icons";
import { usePathname, useRouter } from "next/navigation";
import { clearToken } from "@/lib/auth";

const { Header, Sider, Content } = Layout;

export default function AuthedLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [collapsed, setCollapsed] = useState(false);

    const selectedKey = useMemo(() => {
        if (pathname.startsWith("/accounts")) return "/accounts";
        if (pathname.startsWith("/withdrawals")) return "/withdrawals";
        return "/";
    }, [pathname]);

    return (
        <Layout style={{ minHeight: "100vh" }}>
            <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed}>
                <div style={{ height: 48, margin: 16, color: "#fff", display: "flex", alignItems: "center" }}>
                    <Typography.Text style={{ color: "#fff" }}>{collapsed ? "AP" : "Agent Portal"}</Typography.Text>
                </div>

                <Menu
                    theme="dark"
                    mode="inline"
                    selectedKeys={[selectedKey]}
                    onClick={(e) => router.push(e.key)}
                    items={[
                        { key: "/", icon: <DashboardOutlined />, label: "总览" },
                        { key: "/accounts", icon: <WalletOutlined />, label: "账户与余额" },
                        { key: "/withdrawals", icon: <SwapOutlined />, label: "提现" },
                    ]}
                />
            </Sider>

            <Layout>
                <Header style={{ background: "#fff", display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                    <Button
                        icon={<LogoutOutlined />}
                        onClick={() => {
                            clearToken();
                            router.replace("/login");
                        }}
                    >
                        退出
                    </Button>
                </Header>

                <Content style={{ padding: 16 }}>{children}</Content>
            </Layout>
        </Layout>
    );
}
