// Daily AI-usage budget — the single client-side source of truth.
//
// We meter *real* Anthropic token usage (input + output) per user per day,
// like Claude's own usage limit: one flat daily allowance, no tiers, no
// purchases. The server is authoritative; the gate is inlined in BOTH
// `api/agent/chat.ts` and `api/decks/generate.ts` (they can't import from
// `src/`, and Vercel won't bundle a shared sibling file), each with its own
// copy of DAILY_TOKEN_LIMIT — so if you change the number here, change it in
// both of those too.
//
// The budget resets at UTC midnight. Usage is logged as `consumption` rows in
// `public.token_transactions` (delta = -tokens); "used today" is the sum of
// those rows since the start of the current UTC day.
export const DAILY_TOKEN_LIMIT = 200_000;

/** Warn the user when this fraction (or less) of the daily budget remains. */
export const LOW_REMAINING_FRACTION = 0.15;

/** Compact token count for chips/meters: 1530 → "2k", 850 → "850". */
export function formatTokens(n: number): string {
  const v = Math.max(0, Math.round(n));
  return v >= 1000 ? `${Math.round(v / 1000)}k` : String(v);
}

/** ISO timestamp for the start of the current UTC day (the reset boundary). */
export function startOfUtcDayISO(now: Date = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

/** The next reset moment — upcoming UTC midnight, as a local Date. */
export function nextDailyReset(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
}
