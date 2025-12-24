import { http } from "./http";
import type { AccountsResp, BalanceSummaryResp } from "./types";

export async function fetchAccounts(): Promise<AccountsResp> {
    const res = await http.get("/api/accounts");
    return res.data;
}

export async function fetchBalanceSummary(): Promise<BalanceSummaryResp> {
    const res = await http.get("/api/agents/me/balance-summary");
    return res.data;
}

import type { TransactionsResp, WithdrawalsResp } from "./types";

export async function fetchTransactions(take = 50): Promise<TransactionsResp> {
    const res = await http.get("/api/transactions", { params: { take } });
    return res.data;
}

export async function fetchWithdrawals(take = 50): Promise<WithdrawalsResp> {
    const res = await http.get("/api/withdrawals", { params: { take } });
    return res.data;
}

export async function createWithdrawal(payload: {
    accountMapId: string;
    tronAddress: string;
    amountMinor: string;
}): Promise<any> {
    const res = await http.post("/api/withdrawals", payload);
    return res.data;
}

export async function createCustomer(payload: any) {
    const res = await http.post("/api/customers", payload);
    return res.data;
}

export async function createAccount(payload: any) {
    const res = await http.post("/api/accounts", payload);
    return res.data;
}
