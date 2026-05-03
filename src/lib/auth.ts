import { supabase } from './supabase';
import {
  FREE_SIGNUP_TOKENS,
  FEATURE_COST,
  findPackage,
  type Feature,
  type PackageId,
} from './packages';
import { recordTransaction } from './transactions';

export type User = {
  id: string;
  username: string;
  credits: number;
  created_at: string;
};

const SALT = 'anatom3d-hackathon-v1';

export async function hashPassword(plain: string): Promise<string> {
  const data = new TextEncoder().encode(SALT + plain);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function rowToUser(r: { id: string; username: string; credits: number; created_at: string }): User {
  return { id: r.id, username: r.username, credits: r.credits, created_at: r.created_at };
}

export async function signup(username: string, password: string): Promise<User> {
  const u = username.trim().toLowerCase();
  if (!u || !password) throw new Error('Korisničko ime i lozinka su obavezni.');
  const password_hash = await hashPassword(password);

  const { data, error } = await supabase
    .from('users')
    .insert({ username: u, password_hash, credits: FREE_SIGNUP_TOKENS })
    .select('id, username, credits, created_at')
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('Korisničko ime je već zauzeto.');
    throw new Error(error.message);
  }
  const user = rowToUser(data);
  // Best-effort grant entry. If the ledger insert fails we still keep the
  // balance — the user has their tokens, the audit trail is just sparse.
  void recordTransaction({
    userId: user.id,
    kind: 'signup_grant',
    delta: FREE_SIGNUP_TOKENS,
    balanceAfter: user.credits,
  });
  return user;
}

export async function login(username: string, password: string): Promise<User> {
  const u = username.trim().toLowerCase();
  if (!u || !password) throw new Error('Korisničko ime i lozinka su obavezni.');
  const password_hash = await hashPassword(password);

  const { data, error } = await supabase
    .from('users')
    .select('id, username, credits, created_at, password_hash')
    .eq('username', u)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data || data.password_hash !== password_hash) {
    throw new Error('Pogrešno korisničko ime ili lozinka.');
  }
  return rowToUser(data);
}

export async function getUserById(id: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('id, username, credits, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToUser(data) : null;
}

export async function addCredits(userId: string, delta: number): Promise<User> {
  const current = await getUserById(userId);
  if (!current) throw new Error('Korisnik nije pronađen.');
  const next = current.credits + delta;

  const { data, error } = await supabase
    .from('users')
    .update({ credits: next })
    .eq('id', userId)
    .select('id, username, credits, created_at')
    .single();

  if (error) throw new Error(error.message);
  return rowToUser(data);
}

export type ConsumeResult =
  | { ok: true; user: User }
  | { ok: false; reason: 'insufficient_balance'; user: User };

// Atomic-ish decrement: we do a conditional UPDATE that only fires when
// `credits >= count`. If 0 rows match, the user can't afford the feature
// and we surface that to the caller. Race-safe enough for the hackathon
// trust model (no double-spend protection across concurrent tabs, but a
// single tab can't go negative).
//
// TODO(server-side gate): mirror this check inside the Vercel API routes
// using the Supabase service role so the LLM can't be hit by a client
// that bypasses this layer.
export async function consumeTokens(
  userId: string,
  feature: Feature,
): Promise<ConsumeResult> {
  const cost = FEATURE_COST[feature];
  const { data, error } = await supabase
    .rpc('consume_tokens', { p_user_id: userId, p_amount: cost });

  // If the RPC isn't installed (it's optional — we have a JS fallback),
  // fall back to a read-then-write that's still cheap enough for this app.
  // Postgres raises "function ... does not exist"; PostgREST surfaces it as
  // "Could not find the function ... in the schema cache" — match both.
  if (
    error &&
    (/function .* does not exist/i.test(error.message) ||
      /could not find the function .* in the schema cache/i.test(error.message))
  ) {
    return consumeTokensFallback(userId, feature, cost);
  }
  if (error) throw new Error(error.message);
  if (!data || (Array.isArray(data) && data.length === 0)) {
    const fresh = await getUserById(userId);
    if (!fresh) throw new Error('Korisnik nije pronađen.');
    return { ok: false, reason: 'insufficient_balance', user: fresh };
  }
  const row = Array.isArray(data) ? data[0] : data;
  const user = rowToUser(row);
  void recordTransaction({
    userId,
    kind: 'consumption',
    delta: -cost,
    balanceAfter: user.credits,
    feature,
  });
  return { ok: true, user };
}

async function consumeTokensFallback(
  userId: string,
  feature: Feature,
  cost: number,
): Promise<ConsumeResult> {
  const current = await getUserById(userId);
  if (!current) throw new Error('Korisnik nije pronađen.');
  if (current.credits < cost) {
    return { ok: false, reason: 'insufficient_balance', user: current };
  }
  const { data, error } = await supabase
    .from('users')
    .update({ credits: current.credits - cost })
    .eq('id', userId)
    .gte('credits', cost)
    .select('id, username, credits, created_at')
    .single();

  if (error) {
    // PGRST116 = "no rows returned" — likely lost a race. Re-read.
    if (error.code === 'PGRST116') {
      const fresh = await getUserById(userId);
      return { ok: false, reason: 'insufficient_balance', user: fresh ?? current };
    }
    throw new Error(error.message);
  }
  const user = rowToUser(data);
  void recordTransaction({
    userId,
    kind: 'consumption',
    delta: -cost,
    balanceAfter: user.credits,
    feature,
  });
  return { ok: true, user };
}

// Mock purchase. No payment processor is wired up yet — this just credits
// the balance, records a purchase transaction, and returns the fresh user.
// TODO(payments): replace with App Store IAP / Google Play Billing receipt
// validation. Don't trust the client beyond the prototype phase.
export async function purchasePackage(
  userId: string,
  packageId: PackageId,
): Promise<User> {
  const pkg = findPackage(packageId);
  const updated = await addCredits(userId, pkg.tokens);
  await recordTransaction({
    userId,
    kind: 'purchase',
    delta: pkg.tokens,
    balanceAfter: updated.credits,
    packageId: pkg.id,
    priceEur: pkg.priceEur,
  });
  return updated;
}
