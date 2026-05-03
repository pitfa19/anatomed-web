// Token packages and feature costs — single source of truth for the
// AI pricing model. UI, transaction recording, and consumption gating
// all import from here.

export const FREE_SIGNUP_TOKENS = 30;
export const LOW_BALANCE_THRESHOLD = 10;

export type Feature = 'agent_chat' | 'deck_generate';

export const FEATURE_COST: Record<Feature, number> = {
  agent_chat: 1,
  deck_generate: 3,
};

export const FEATURE_LABEL: Record<Feature, string> = {
  agent_chat: 'AI razgovor',
  deck_generate: 'AI generiranje pitanja',
};

export type PackageId = 'starter' | 'standard' | 'pro';

export type TokenPackage = {
  id: PackageId;
  priceEur: number;
  tokens: number;
  label: string;
  blurb: string;
};

export const PACKAGES: TokenPackage[] = [
  {
    id: 'starter',
    priceEur: 2,
    tokens: 80,
    label: 'Starter',
    blurb: 'Za povremeno korištenje',
  },
  {
    id: 'standard',
    priceEur: 5,
    tokens: 220,
    label: 'Standard',
    blurb: 'Mjesečni paket za prosječnog studenta',
  },
  {
    id: 'pro',
    priceEur: 10,
    tokens: 450,
    label: 'Pro',
    blurb: 'Intenzivno korištenje tijekom ispitnih rokova',
  },
];

export function findPackage(id: PackageId): TokenPackage {
  const p = PACKAGES.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown package: ${id}`);
  return p;
}

// Tier-specific Tailwind classes. Literal strings so the JIT scanner keeps
// them in the bundle. Sky → emerald → violet to signal a clear progression
// (basic → recommended → premium) without depending on theme tokens.
export type TierStyle = {
  border: string; // hover state for the card outer
  accent: string; // text color for label + tokens count
  cta: string; // resting-state Kupi banner
  ctaHover: string; // group-hover state for Kupi banner
  ring: string; // optional left stripe for the recommended tier
};

export const TIER_STYLES: Record<PackageId, TierStyle> = {
  starter: {
    border: 'hover:border-sky-400',
    accent: 'text-sky-500',
    cta: 'bg-sky-500/15 text-sky-600',
    ctaHover: 'group-hover:bg-sky-500 group-hover:text-white',
    ring: '',
  },
  standard: {
    border: 'hover:border-emerald-400',
    accent: 'text-emerald-500',
    cta: 'bg-emerald-500/15 text-emerald-600',
    ctaHover: 'group-hover:bg-emerald-500 group-hover:text-white',
    ring: 'border-emerald-400/50',
  },
  pro: {
    border: 'hover:border-violet-400',
    accent: 'text-violet-500',
    cta: 'bg-violet-500/15 text-violet-600',
    ctaHover: 'group-hover:bg-violet-500 group-hover:text-white',
    ring: '',
  },
};
