import { http } from "./http";
import type { AccountsResp, BalanceSummaryResp, CustomersResp, WithdrawalWhitelistResp } from "./types";

export type CreateCustomerPayload = {
    out_user_id?: string;
    customer_email?: string;
    customer_type: string;
    country_code?: string;
    company_name?: string;
    registration_number?: string;
    company_representative_name?: string;
    company_representative_document_type?: string;
    company_representative_number?: string;
    company_document_id?: string;
    company_handheld_document_id?: string;
    id_front_side_document_id?: string;
    id_back_side_document_id?: string;
    first_name?: string;
    middle_name?: string;
    last_name?: string;
    id_document_type?: string;
    id_document_number?: string;
};

export type CreateAccountPayload = {
    customer_map_id: string;
    currency: string;
    country_code: string;
    email?: string;
    company_name?: string;
    registration_number?: string;
    trading_country?: string;
    trading_address?: string;
    trading_city?: string;
    nationality?: string;
    post_code?: string;
    first_name?: string;
    middle_name?: string;
    last_name?: string;
    city?: string;
    address_line?: string;
    birth_date?: string;
};

export async function fetchAccounts(): Promise<AccountsResp> {
    const res = await http.get("/api/accounts");
    return res.data;
}

export async function fetchCustomers(): Promise<CustomersResp> {
    const res = await http.get("/api/customers");
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

export async function fetchWithdrawalWhitelist(): Promise<WithdrawalWhitelistResp> {
    const res = await http.get("/api/withdrawals/whitelist");
    return res.data;
}

export async function fetchLatestExchangeRate(): Promise<{ rateMinor: number | null; updatedAt?: string | null }> {
    const res = await http.get("/api/rates/eur-usd/latest");
    return res.data;
}

export async function fetchAgentEurUsdFee(): Promise<{ feeMinor: number | null; updatedAt?: string | null }> {
    const res = await http.get("/api/agents/me/eur-usd-fee");
    return res.data;
}

export type UploadDocumentResponse = {
    document_id: string;
    filename: string;
    content_type: string;
    size: number;
};

export async function uploadDocument(payload: {
    fileName: string;
    contentType?: string;
    contentBase64: string;
}): Promise<UploadDocumentResponse> {
    const res = await http.post("/api/uploads", {
        file_name: payload.fileName,
        content_type: payload.contentType || "application/octet-stream",
        content_base64: payload.contentBase64,
    });
    return res.data;
}

export async function createWithdrawal(payload: {
    accountMapId: string;
    tronAddress: string;
    amountMinor: string;
    exchangeRateMinor: number | string;
    agentFeeMinor: number | string;
}): Promise<unknown> {
    const res = await http.post("/api/withdrawals", {
        accountMapId: payload.accountMapId,
        tronAddress: payload.tronAddress,
        amountMinor: payload.amountMinor,
        exchange_rate_minor: payload.exchangeRateMinor,
        agent_fee_minor: payload.agentFeeMinor,
    });
    return res.data;
}

export async function createCustomer(payload: CreateCustomerPayload) {
    const res = await http.post("/api/customers", payload);
    return res.data;
}

export async function createAccount(payload: CreateAccountPayload) {
    const res = await http.post("/api/accounts", payload);
    return res.data;
}
