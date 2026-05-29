import { supabase } from './supabase';
import { startOfUtcDayISO } from './usage';

export type User = {
  id: string;
  username: string;
  created_at: string;
  /** Real Anthropic tokens (input + output) spent since the start of the
   *  current UTC day. Compared against DAILY_TOKEN_LIMIT for the meter. */
  tokensUsedToday: number;
};

const SALT = 'anatom3d-hackathon-v1';

export async function hashPassword(plain: string): Promise<string> {
  const data = new TextEncoder().encode(SALT + plain);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

type UserRow = { id: string; username: string; created_at: string };

function rowToUser(r: UserRow, tokensUsedToday: number): User {
  return { id: r.id, username: r.username, created_at: r.created_at, tokensUsedToday };
}

// Sum today's AI usage from the ledger. The server records one `consumption`
// row per Anthropic call (delta = -tokens); we read them back with the anon
// key (the table's RLS allows anon select) to drive the profile meter and the
// header chip. Best-effort: a read failure just shows 0 used.
async function fetchUsageToday(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('token_transactions')
    .select('delta')
    .eq('user_id', userId)
    .eq('kind', 'consumption')
    .gte('created_at', startOfUtcDayISO());
  if (error || !data) return 0;
  return data.reduce((sum, r) => sum + Math.max(0, -(r.delta ?? 0)), 0);
}

export async function signup(username: string, password: string): Promise<User> {
  const u = username.trim().toLowerCase();
  if (!u || !password) throw new Error('Korisničko ime i lozinka su obavezni.');
  const password_hash = await hashPassword(password);

  const { data, error } = await supabase
    .from('users')
    .insert({ username: u, password_hash })
    .select('id, username, created_at')
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('Korisničko ime je već zauzeto.');
    throw new Error(error.message);
  }
  // A brand-new account hasn't used anything today.
  return rowToUser(data, 0);
}

export async function login(username: string, password: string): Promise<User> {
  const u = username.trim().toLowerCase();
  if (!u || !password) throw new Error('Korisničko ime i lozinka su obavezni.');
  const password_hash = await hashPassword(password);

  const { data, error } = await supabase
    .from('users')
    .select('id, username, created_at, password_hash')
    .eq('username', u)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data || data.password_hash !== password_hash) {
    throw new Error('Pogrešno korisničko ime ili lozinka.');
  }
  const used = await fetchUsageToday(data.id);
  return rowToUser(data, used);
}

export async function getUserById(id: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('id, username, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const used = await fetchUsageToday(id);
  return rowToUser(data, used);
}
