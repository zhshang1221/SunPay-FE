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

export type WithdrawalWhitelistItem = {
    id: string;
    agentId: string;
    address: string;
    label?: string | null;
    createdAt?: string;
};

export type WithdrawalWhitelistResp = { items: WithdrawalWhitelistItem[] };

export type CustomerItem = {
    id: string;
    outUserId: string;
    sunpayCustomerId: string;
    customerType?: string | null;
    customerEmail: string;
    status?: string | null;
    sunpayStatus?: string | null;
    countryCode?: string | null;
    firstName?: string | null;
    middleName?: string | null;
    lastName?: string | null;
    companyName?: string | null;
    registrationNumber?: string | null;
    createdAt?: string;
    rawJson?: string | null;
};

export type CustomersResp = { items: CustomerItem[] };

export type AccountItem = {
    id: string;
    sunpayAccountId: string;
    currency?: string | null;
    status?: string | null;
    createdAt?: string;

    balanceMinor: string;
    balanceCurrency?: string | null;

    countryCode?: string | null;
    firstName?: string | null;
    middleName?: string | null;
    lastName?: string | null;
    email?: string | null;
    addressLine?: string | null;
    city?: string | null;
    postCode?: string | null;
    nationality?: string | null;
    birthDate?: string | null;
    companyName?: string | null;
    registrationNumber?: string | null;
    tradingCountry?: string | null;
    tradingCity?: string | null;
    tradingAddress?: string | null;
    iban?: string | null;
    swiftBic?: string | null;
    accountNumber?: string | null;
    bankCountry?: string | null;
    bankAddress?: string | null;
    bankName?: string | null;
    bankAccountHolderName?: string | null;
    routingCodeEntries?: string | null;
    depositInstructions?: string | null;

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
