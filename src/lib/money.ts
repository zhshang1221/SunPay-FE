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

export function currencyDecimals(ccy: string): number {
    const C = (ccy || "").toUpperCase();
    // 常见：EUR/USD 2 位；JPY 0 位。你后续可按需要扩充
    if (C === "JPY") return 0;
    return 2;
}

export function decimalToMinor(value: string | number) {
    const str = typeof value === "number" ? value.toFixed(2) : String(value ?? "").trim();
    if (!/^\d+(\.\d{0,2})?$/.test(str)) {
        throw new Error("金额最多支持两位小数");
    }
    const [intPartRaw, decimalRaw = ""] = str.split(".");
    const intPart = intPartRaw.replace(/^0+(?=\d)/, "") || "0";
    const decimals = (decimalRaw + "00").slice(0, 2);
    return BigInt(`${intPart}${decimals}`).toString();
}

export function minorToDecimalString(value: string | number | bigint, decimals = 2) {
    const str = typeof value === "bigint" ? value.toString() : String(value ?? "");
    const negative = str.startsWith("-");
    const digitsRaw = negative ? str.slice(1) : str;
    const digits = digitsRaw.replace(/\D/g, "") || "0";

    if (decimals <= 0) {
        return `${negative ? "-" : ""}${digits.replace(/^0+(?=\d)/, "") || "0"}`;
    }

    const padded = digits.padStart(decimals + 1, "0");
    const intPart = padded.slice(0, -decimals) || "0";
    const decimalPart = padded.slice(-decimals).padStart(decimals, "0");
    return `${negative ? "-" : ""}${intPart}.${decimalPart}`;
}
