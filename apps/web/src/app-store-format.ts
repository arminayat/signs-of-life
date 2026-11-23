import type { Counts } from "../../../packages/core/src/app-store";
const regions = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();
/** "Germany (DE)" for an App Store country code; unknown codes stay as given. */
export function countryName(code: string) {
  try {
    const name = regions?.of(code);
    return name && name !== code ? `${name} (${code})` : code;
  } catch {
    return code;
  }
}
export function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
/** Amounts per currency, largest first; currencies are never converted. */
export function moneyList(amounts: Counts) {
  return Object.entries(amounts)
    .filter(([, amount]) => amount)
    .sort((a, b) => b[1] - a[1])
    .map(([currency, amount]) => money(amount, currency))
    .join(", ");
}
/** READY_FOR_SALE → "Ready for sale". */
export function stateLabel(state: string) {
  const text = state.toLowerCase().replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
/** Apple's Sales reports call Macs "Desktop". */
export function deviceName(device: string) {
  return device === "Desktop" ? "Mac" : device;
}
