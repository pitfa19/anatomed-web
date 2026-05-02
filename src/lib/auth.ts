import { supabase } from './supabase';

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
    .insert({ username: u, password_hash, credits: 0 })
    .select('id, username, credits, created_at')
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('Korisničko ime je već zauzeto.');
    throw new Error(error.message);
  }
  return rowToUser(data);
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
