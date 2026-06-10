/** Cents → "1.234,56 EUR" (es-ES). */
export function formatCents(cents: number, currency = 'EUR'): string {
  const formatted = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
  return `${formatted} ${currency}`;
}

/** Fee label: "Gratis" when 0, otherwise the formatted amount. */
export function formatFee(cents: number, currency = 'EUR'): string {
  return cents === 0 ? 'Gratis' : formatCents(cents, currency);
}
