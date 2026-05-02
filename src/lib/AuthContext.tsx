import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  type User,
  getUserById,
  login as authLogin,
  signup as authSignup,
  addCredits as authAddCredits,
} from './auth';
import { cloudSyncToLocal, clearCloudScopedLocal } from './cloudDocs';
import { bumpLocalDocsCache } from './data';

const STORAGE_KEY = 'anatom3d.auth.userId.v1';

type AuthCtx = {
  user: User | null;
  loading: boolean;
  syncing: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshCredits: () => Promise<void>;
  addCredits: (delta: number) => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

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

  useEffect(() => {
    const id = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!id) {
      setLoading(false);
      return;
    }
    getUserById(id)
      .then((u) => {
        setUser(u);
        if (u) void runSync(u.id);
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
    async login(username, password) {
      const u = await authLogin(username, password);
      persist(u);
      void runSync(u.id);
    },
    async signup(username, password) {
      const u = await authSignup(username, password);
      persist(u);
      void runSync(u.id);
    },
    async logout() {
      persist(null);
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
    async addCredits(delta: number) {
      if (!user) return;
      setUser(await authAddCredits(user.id, delta));
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
