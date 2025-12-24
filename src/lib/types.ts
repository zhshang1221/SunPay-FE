export type AccountsResp = { items: AccountItem[] };

export type BalanceSummaryResp = {
    byCurrency: Record<string, string>; // { EUR: "4995", ... }
    accountsCount: number;
};

export type TransactionEventItem = {
    id: string;
    bizType: string;
    bizStatus: string;
    orderNo?: string | null;
    reference?: string | null;
    outUserId?: string | null;
    recipientAccountId?: string | null;
    settlementAmount?: string | null;
    settlementCurrency?: string | null;
    receivedAt?: string;
    settlementTime?: string | null;
};

export type TransactionsResp = { items: TransactionEventItem[] };

export type WithdrawalItem = {
    id: string;
    agentId: string;
    accountMapId: string;
    tronAddress: string;
    amountMinor: string;
    currency: string;
    status: string;
    larkSent: boolean;
    createdAt?: string;

    accountMap?: {
        id: string;
        sunpayAccountId: string;
        balanceMinor: string; // 后端应转 string
        balanceCurrency?: string | null;
        currency?: string | null;
    };
};

export type WithdrawalsResp = { items: WithdrawalItem[] };

export type AccountItem = {
    id: string;
    sunpayAccountId: string;
    currency?: string | null;
    status?: string | null;
    createdAt?: string;

    balanceMinor: string;
    balanceCurrency?: string | null;

    // ✅ 若后端愿意返回（建议返回），前端可用它解析 iban/swift 等
    rawJson?: string | null;

    customerMap?: {
        id: string;
        outUserId: string;
        sunpayCustomerId: string;
        customerType?: string;
        customerEmail?: string;

        // ✅ 建议后端后续加，但前端先做兼容：没有就用 outUserId/公司名回退
        displayName?: string | null;
        companyName?: string | null;
        firstName?: string | null;
        lastName?: string | null;
    };
};
