/**
 * A neighbourhood odd job is not an unbounded number. Without a ceiling people
 * type enough zeroes that Float renders as "1e+29", which overflows the card
 * header and the job detail title. Mirrors BUDGET_MAX in api/index.ts - the
 * server is the one that actually enforces it, this is only so the form can
 * say no before the round trip.
 */
export const BUDGET_MAX = 900000;

/**
 * "$1,200". Always whole dollars unless there are real cents, and never
 * scientific notation - rows created before the cap existed still hold
 * absurd numbers, and toLocaleString keeps them from wrecking the layout.
 */
export function formatMoney(value: unknown): string {
  const amount = typeof value === 'number' ? value : parseFloat(String(value));
  if (!Number.isFinite(amount)) return '$0';
  // Rows posted before the cap existed can hold anything, and a comma-
  // separated 1e+29 is thirty characters of layout damage. Bound the
  // rendering too, not just new input.
  if (amount > BUDGET_MAX) return `$${BUDGET_MAX.toLocaleString('en-US')}+`;
  const hasCents = Math.round(amount * 100) % 100 !== 0;
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  })}`;
}

/** "$50 - $200", collapsing to a single figure when the range is a point. */
export function formatRange(min: unknown, max: unknown): string {
  const lo = formatMoney(min);
  const hi = formatMoney(max);
  return lo === hi ? lo : `${lo} - ${hi}`;
}
