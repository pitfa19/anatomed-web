import { supabase } from './supabase';
import type { Feature, PackageId } from './packages';

export type TransactionKind =
  | 'signup_grant'
  | 'purchase'
  | 'consumption'
  | 'refund'
  | 'manual_adjust';

export type TokenTransaction = {
  id: string;
  user_id: string;
  kind: TransactionKind;
  delta: number;
  balance_after: number;
  package_id: PackageId | null;
  price_eur: number | null;
  feature: Feature | null;
  created_at: string;
};

export type RecordTransactionInput = {
  userId: string;
  kind: TransactionKind;
  delta: number;
  balanceAfter: number;
  packageId?: PackageId | null;
  priceEur?: number | null;
  feature?: Feature | null;
};

// Best-effort insert into the token_transactions ledger. We never want a
// ledger write failure to take down the underlying balance change, so
// callers should always update `users.credits` first and then await this.
// Returns the inserted row, or null if the insert failed (e.g. the table
// doesn't exist yet on a fresh project).
export async function recordTransaction(
  input: RecordTransactionInput,
): Promise<TokenTransaction | null> {
  const { data, error } = await supabase
    .from('token_transactions')
    .insert({
      user_id: input.userId,
      kind: input.kind,
      delta: input.delta,
      balance_after: input.balanceAfter,
      package_id: input.packageId ?? null,
      price_eur: input.priceEur ?? null,
      feature: input.feature ?? null,
    })
    .select('*')
    .single();

  if (error) {
    console.warn('recordTransaction failed', error.message);
    return null;
  }
  return data as TokenTransaction;
}

export async function listTransactions(
  userId: string,
  limit = 50,
): Promise<TokenTransaction[]> {
  const { data, error } = await supabase
    .from('token_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('listTransactions failed', error.message);
    return [];
  }
  return (data ?? []) as TokenTransaction[];
}
