export function formatMinor(minorStr: string | number | bigint, ccy: string): string {
    const minor = BigInt(minorStr.toString());
    const decimals = currencyDecimals(ccy);
    const sign = minor < 0n ? "-" : "";
    const abs = minor < 0n ? -minor : minor;

    if (decimals === 0) return `${sign}${abs.toString()} ${ccy}`;

    const base = 10n ** BigInt(decimals);
    const integer = abs / base;
    const frac = abs % base;

    const fracStr = frac.toString().padStart(decimals, "0");
    return `${sign}${integer.toString()}.${fracStr} ${ccy}`;
}

function currencyDecimals(ccy: string): number {
    const C = (ccy || "").toUpperCase();
    // 常见：EUR/USD 2 位；JPY 0 位。你后续可按需要扩充
    if (C === "JPY") return 0;
    return 2;
}
