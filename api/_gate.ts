// Shared server-side usage gate for the AI endpoints (`agent/chat`,
// `decks/generate`). Not an endpoint itself — the leading underscore keeps
// Vercel from treating it as a route.
//
// Model: ONE flat daily AI-token allowance per user (like Claude's usage
// limit), no tiers, no purchases. We meter REAL Anthropic tokens (input +
// output) against DAILY_TOKEN_LIMIT, reset at UTC midnight. Usage is logged as
// `consumption` rows in `public.token_transactions` (delta = -tokens), read
// via the Supabase SERVICE ROLE (bypasses RLS).
//
// Fails CLOSED: if the service-role env isn't configured the gate denies
// rather than letting calls through unmetered — so prod MUST set
// SUPABASE_SERVICE_ROLE_KEY (+ SUPABASE_URL, or it falls back to
// VITE_SUPABASE_URL) alongside ANTHROPIC_API_KEY.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Keep in sync with src/lib/usage.ts (DAILY_TOKEN_LIMIT).
export const DAILY_TOKEN_LIMIT = 200_000;

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const admin: SupabaseClient | null =
  supabaseUrl && serviceKey
    ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
    : null;

export interface GateDenied {
  status: number;
  code: string;
  error: string;
}
export type GateResult = { denied: GateDenied } | { ok: true; usedToday: number };

export type UsageFeature = 'agent_chat' | 'deck_generate';

function startOfUtcDayISO(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

async function usageToday(userId: string): Promise<number> {
  if (!admin) return 0;
  const { data, error } = await admin
    .from('token_transactions')
    .select('delta')
    .eq('user_id', userId)
    .eq('kind', 'consumption')
    .gte('created_at', startOfUtcDayISO());
  if (error || !data) return 0;
  return (data as { delta: number | null }[]).reduce(
    (sum, r) => sum + Math.max(0, -(r.delta ?? 0)),
    0,
  );
}

/** Verify the caller is a real signed-in user with budget left today.
 *  Returns tokens already used today so the caller can record post-call. */
export async function gateDaily(userId: string | undefined): Promise<GateResult> {
  if (!admin) {
    return {
      denied: { status: 500, code: 'gate_unavailable', error: 'Usage gate is not configured on the server.' },
    };
  }
  if (!userId || typeof userId !== 'string') {
    return { denied: { status: 401, code: 'auth_required', error: 'Sign in to use the assistant.' } };
  }
  const { data: user, error } = await admin
    .from('users')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    return { denied: { status: 500, code: 'gate_error', error: error.message } };
  }
  if (!user) {
    return { denied: { status: 401, code: 'auth_required', error: 'Sign in to use the assistant.' } };
  }
  const usedToday = await usageToday(userId);
  if (usedToday >= DAILY_TOKEN_LIMIT) {
    return { denied: { status: 429, code: 'daily_limit', error: "You've reached today's AI limit." } };
  }
  return { ok: true, usedToday };
}

/** Log a call's real token cost as a consumption row. Best-effort: never throws. */
export async function recordUsage(
  userId: string,
  tokens: number,
  feature: UsageFeature,
  usedBefore: number,
): Promise<void> {
  if (!admin || !Number.isFinite(tokens) || tokens <= 0) return;
  const remaining = Math.max(0, DAILY_TOKEN_LIMIT - (usedBefore + tokens));
  const { error } = await admin.from('token_transactions').insert({
    user_id: userId,
    kind: 'consumption',
    delta: -Math.round(tokens),
    balance_after: remaining,
    feature,
  });
  if (error) {
    // Ledger write is non-critical; the answer was already produced.
    console.warn('recordUsage failed', error.message);
  }
}
