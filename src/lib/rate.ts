export function formatExchangeRateMinor(rate?: number | null): string | null {
    if (rate === undefined || rate === null || Number.isNaN(rate)) return null;
    const sign = rate < 0 ? "-" : "";
    const abs = Math.abs(rate);
    const integer = Math.floor(abs / 10000);
    const fraction = abs % 10000;
    return `${sign}${integer}.${fraction.toString().padStart(4, "0")}`;
}

export function formatFeePercentFromMinor(fee?: number | null): string | null {
    if (fee === undefined || fee === null || Number.isNaN(fee)) return null;
    const percent = fee / 100;
    const formatted = percent.toFixed(2).replace(/\.?0+$/, "");
    return `${formatted}%`;
}

export function computeUsdPreviewFromMinor(amountMinorStr: string, rateMinor: number, feeMinor: number): string {
    const amountMinor = BigInt(amountMinorStr);
    const rateBig = BigInt(Math.trunc(rateMinor));
    const PRECISION = 10000n;
    const feeFactor = PRECISION - BigInt(Math.trunc(feeMinor));
    const numerator = amountMinor * rateBig * feeFactor;
    const denominator = PRECISION * PRECISION;
    const usdMinor = numerator / denominator;
    const dollars = usdMinor / 100n;
    const cents = usdMinor % 100n;
    return `${dollars.toString()}.${cents.toString().padStart(2, "0")}`;
}
