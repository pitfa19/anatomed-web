import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  type User,
  type ConsumeResult,
  getUserById,
  login as authLogin,
  signup as authSignup,
  addCredits as authAddCredits,
  consumeTokens as authConsumeTokens,
  purchasePackage as authPurchasePackage,
} from './auth';
import { listTransactions, type TokenTransaction } from './transactions';
import type { Feature, PackageId } from './packages';
import { cloudSyncToLocal, clearCloudScopedLocal } from './cloudDocs';
import { bumpLocalDocsCache } from './data';

const STORAGE_KEY = 'anatom3d.auth.userId.v1';

type AuthCtx = {
  user: User | null;
  loading: boolean;
  syncing: boolean;
  transactions: TokenTransaction[];
  login: (username: string, password: string) => Promise<void>;
  signup: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshCredits: () => Promise<void>;
  refreshTransactions: () => Promise<void>;
  addCredits: (delta: number) => Promise<void>;
  consumeTokens: (feature: Feature) => Promise<ConsumeResult>;
  purchasePackage: (packageId: PackageId) => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [transactions, setTransactions] = useState<TokenTransaction[]>([]);

  async function runSync(userId: string) {
    setSyncing(true);
    try {
      await cloudSyncToLocal(userId);
      bumpLocalDocsCache();
    } catch (e) {
      console.warn('cloudSyncToLocal failed', e);
    } finally {
      setSyncing(false);
    }
  }

  async function loadTransactions(userId: string) {
    const rows = await listTransactions(userId, 50);
    setTransactions(rows);
  }

  useEffect(() => {
    const id = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!id) {
      setLoading(false);
      return;
    }
    getUserById(id)
      .then((u) => {
        setUser(u);
        if (u) {
          void runSync(u.id);
          void loadTransactions(u.id);
        }
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const persist = (u: User | null) => {
    setUser(u);
    if (u) localStorage.setItem(STORAGE_KEY, u.id);
    else localStorage.removeItem(STORAGE_KEY);
  };

  const value: AuthCtx = {
    user,
    loading,
    syncing,
    transactions,
    async login(username, password) {
      const u = await authLogin(username, password);
      persist(u);
      void runSync(u.id);
      void loadTransactions(u.id);
    },
    async signup(username, password) {
      const u = await authSignup(username, password);
      persist(u);
      void runSync(u.id);
      void loadTransactions(u.id);
    },
    async logout() {
      persist(null);
      setTransactions([]);
      try {
        await clearCloudScopedLocal();
        bumpLocalDocsCache();
      } catch (e) {
        console.warn('clearCloudScopedLocal failed', e);
      }
    },
    async refreshCredits() {
      if (!user) return;
      const fresh = await getUserById(user.id);
      if (fresh) setUser(fresh);
    },
    async refreshTransactions() {
      if (!user) return;
      await loadTransactions(user.id);
    },
    async addCredits(delta: number) {
      if (!user) return;
      setUser(await authAddCredits(user.id, delta));
    },
    async consumeTokens(feature: Feature) {
      if (!user) {
        return { ok: false, reason: 'insufficient_balance', user: { id: '', username: '', credits: 0, created_at: '' } };
      }
      const res = await authConsumeTokens(user.id, feature);
      setUser(res.user);
      if (res.ok) {
        // Fire-and-forget refresh so /profile stays current without
        // gating the agent reply on the round-trip.
        void loadTransactions(user.id);
      }
      return res;
    },
    async purchasePackage(packageId: PackageId) {
      if (!user) return;
      const updated = await authPurchasePackage(user.id, packageId);
      setUser(updated);
      void loadTransactions(user.id);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
