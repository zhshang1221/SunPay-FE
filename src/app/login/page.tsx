"use client";

import { Button, Card, Form, Input, Typography, message } from "antd";
import { useRouter } from "next/navigation";
import { http } from "@/lib/http";
import { setToken } from "@/lib/auth";

export default function LoginPage() {
    const router = useRouter();
    const [msgApi, contextHolder] = message.useMessage();

    const onFinish = async (v: { username: string; password: string }) => {
        try {
            const res = await http.post("/api/auth/login", v);
            const token = res.data?.token;
            if (!token) throw new Error("Missing token in response");
            setToken(token);
            msgApi.success("登录成功");
            router.replace("/");
        } catch (e: any) {
            const m = e?.response?.data?.message ?? e?.message ?? "登录失败";
            msgApi.error(m);
        }
    };

    return (
        <>
            {contextHolder}
            <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
                <Card style={{ width: 420 }}>
                    <Typography.Title level={3} style={{ marginTop: 0 }}>
                        代理商平台登录
                    </Typography.Title>

                    <Form layout="vertical" onFinish={onFinish} initialValues={{ username: "agent_admin" }}>
                        <Form.Item label="用户名" name="username" rules={[{ required: true }]}>
                            <Input />
                        </Form.Item>
                        <Form.Item label="密码" name="password" rules={[{ required: true }]}>
                            <Input.Password />
                        </Form.Item>
                        <Button type="primary" htmlType="submit" block>
                            登录
                        </Button>
                    </Form>
                </Card>
            </div>
        </>
    );
}
