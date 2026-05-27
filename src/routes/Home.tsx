import { Link } from 'react-router-dom';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { ArrowRight, MessagesSquare, X, Sparkles, Search } from 'lucide-react';
import { useStats } from '../lib/useStats';
import { useReducedMotion } from '../lib/useReducedMotion';
import { useScrollProgress } from '../lib/useScrollProgress';
import { bundledPageImageUrl } from '../lib/data';
import { useT } from '../lib/i18n';
import MeshGradientBg from '../components/home/MeshGradientBg';
import CursorSpotlight from '../components/home/CursorSpotlight';
import HeroHeadline from '../components/home/HeroHeadline';
import StatChip from '../components/home/StatChip';
import HeroSpineFallback from '../components/home/HeroSpineFallback';
import BentoSkripteTile from '../components/home/BentoSkripteTile';
import BentoAgentTile from '../components/home/BentoAgentTile';
import BentoReviseTile from '../components/home/BentoReviseTile';
import BentoViewerTile from '../components/home/BentoViewerTile';
import SectionReveal from '../components/home/SectionReveal';
import FooterCTA from '../components/home/FooterCTA';

const HeroAnatomy3D = lazy(() => import('../components/home/HeroAnatomy3D'));

const WELCOME_KEY = 'anatom3d_welcome_dismissed_v1';

export default function Home() {
  const t = useT();
  const [showWelcome, setShowWelcome] = useState(false);
  const stats = useStats();
  const reduced = useReducedMotion();
  // 0 at top, 1 after the hero has scrolled up by one viewport-height -
  // drives the muscle reveal in HeroAnatomy3D.
  const heroRef = useRef<HTMLElement>(null);
  const muscleProgress = useScrollProgress(heroRef);

  useEffect(() => {
    if (!localStorage.getItem(WELCOME_KEY)) setShowWelcome(true);
  }, []);

  function dismissWelcome() {
    localStorage.setItem(WELCOME_KEY, '1');
    setShowWelcome(false);
  }

  return (
    <div className="flex flex-col gap-12 sm:gap-20 lg:gap-28">
      {/* ─────────────────────────── HERO ─────────────────────────── */}
      <section ref={heroRef} className="relative overflow-hidden">
        <MeshGradientBg />
        <CursorSpotlight />

        <div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 gap-10 px-5 pb-12 pt-12 sm:px-8 sm:pb-16 sm:pt-16 lg:grid-cols-12 lg:gap-12 lg:pt-24">
          <div className="flex flex-col gap-8 lg:col-span-7 lg:justify-center">
            <HeroHeadline
              eyebrow={t('home.eyebrow')}
              line1=""
              line2="Anatom3D"
              subhead={t('home.subhead')}
            />

            <div className="flex flex-wrap gap-3">
              <Link
                to="/docs"
                className="group inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white shadow-sm transition-all hover:opacity-90 hover:shadow-md"
              >
                {t('home.openNotes')}
                <ArrowRight
                  size={15}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </Link>
              <Link
                to="/agent"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface/80 px-5 py-3 text-sm font-medium text-text-strong backdrop-blur transition-colors hover:bg-surface-2"
              >
                <MessagesSquare size={15} />
                {t('home.askAgent')}
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <StatChip label={t('home.statPages')} value={stats.pages} loading={stats.loading} />
              <StatChip label={t('home.statSources')} value={stats.sources} loading={stats.loading} />
              <StatChip
                label={t('home.statTerms')}
                value={stats.terms}
                loading={stats.loading}
              />
              <StatChip label={t('home.statTopics')} value={stats.topics} loading={stats.loading} />
            </div>
          </div>

          <div className="relative flex h-[320px] items-center justify-center lg:col-span-5 lg:h-[480px]">
            <div
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  'radial-gradient(circle at center, rgba(124,92,255,0.18), transparent 55%)',
              }}
            />
            <div className="relative h-full w-full">
              {reduced ? (
                <HeroSpineFallback />
              ) : (
                <Suspense fallback={<HeroSpineFallback />}>
                  <HeroAnatomy3D reduced={reduced} muscleProgress={muscleProgress} />
                </Suspense>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────── BENTO ─────────────────────────── */}
      <section className="mx-auto w-full max-w-7xl px-5 sm:px-8">
        <SectionReveal>
          <div className="mb-6 flex flex-col gap-2 sm:mb-8">
            <span className="text-xs font-medium uppercase tracking-wider text-accent">
              {t('home.bentoEyebrow')}
            </span>
            <h2 className="text-2xl font-semibold tracking-tight text-text-strong sm:text-3xl">
              {t('home.bentoTitle')}
            </h2>
          </div>
        </SectionReveal>

        <SectionReveal delay={0.05}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-6 lg:auto-rows-[176px]">
            <BentoSkripteTile className="lg:col-span-4 lg:row-span-2" />
            <BentoAgentTile className="lg:col-span-2 lg:row-span-2" />
            <BentoReviseTile className="lg:col-span-3 lg:row-span-2" />
            <BentoViewerTile className="lg:col-span-3 lg:row-span-2" />
          </div>
        </SectionReveal>
      </section>

      {/* ─────────────────────── NARRATIVE 1 ─────────────────────── */}
      <section className="mx-auto w-full max-w-7xl px-5 sm:px-8">
        <SectionReveal>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-12">
            <div className="order-2 lg:order-1 lg:col-span-7">
              <div className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-lg">
                <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-4 py-2.5">
                  <Search size={13} className="text-text-muted" />
                  <span className="font-mono text-xs text-text-strong">acetabulum</span>
                  <span className="ml-auto text-[11px] text-text-muted">24 pogotka · str. 12</span>
                </div>
                <div className="relative aspect-[16/10] bg-bg">
                  <img
                    src={bundledPageImageUrl('handout_a1', 1)}
                    alt=""
                    className="h-full w-full object-cover opacity-95"
                    loading="lazy"
                    decoding="async"
                  />
                  <div
                    className="hl-pulse absolute left-[14%] top-[36%] h-3 w-[36%] rounded-sm"
                    style={{ background: 'rgba(253, 224, 71, 0.85)' }}
                  />
                  <div
                    className="hl-pulse absolute left-[20%] top-[58%] h-3 w-[24%] rounded-sm"
                    style={{ background: 'rgba(253, 224, 71, 0.55)' }}
                  />
                </div>
                <div className="flex items-center justify-between border-t border-border bg-surface-2 px-4 py-2">
                  <span className="text-[11px] text-text-muted">Hand-Out · Banovac</span>
                  <div className="flex items-center gap-1">
                    <kbd className="rounded border border-border bg-bg px-1.5 py-0.5 text-[10px]">↑</kbd>
                    <kbd className="rounded border border-border bg-bg px-1.5 py-0.5 text-[10px]">↓</kbd>
                    <span className="ml-1 text-[11px] text-text-muted">prev / next</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="order-1 lg:order-2 lg:col-span-5 lg:flex lg:flex-col lg:justify-center">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-muted">
                <Search size={12} className="text-accent" />
                {t('home.searchChip')}
              </div>
              <h3 className="text-2xl font-semibold tracking-tight text-text-strong sm:text-3xl">
                {t('home.searchTitle')}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-text-muted sm:text-base">
                {t('home.searchBody')}
              </p>
            </div>
          </div>
        </SectionReveal>
      </section>

      {/* ─────────────────────── NARRATIVE 2 ─────────────────────── */}
      <section className="mx-auto w-full max-w-7xl px-5 sm:px-8">
        <SectionReveal>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-5">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-muted">
                <ArrowRight size={12} className="text-accent" />
                {t('home.pdfChip')}
              </div>
              <h3 className="text-2xl font-semibold tracking-tight text-text-strong sm:text-3xl">
                {t('home.pdfTitle')}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-text-muted sm:text-base">
                {t('home.pdfBody')}
              </p>
            </div>
            <div className="relative flex items-center justify-center lg:col-span-7">
              <div className="relative w-full max-w-md">
                <div className="rounded-2xl border-2 border-dashed border-border bg-surface/60 p-8 text-center backdrop-blur sm:p-12">
                  <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#4a9eff] to-[#16a34a] text-white shadow-md">
                    <ArrowRight size={20} className="-rotate-90" />
                  </div>
                  <p className="text-sm font-medium text-text-strong">{t('home.dropPdf')}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    {t('home.indexingSpeed')}
                  </p>
                </div>
                <div className="pointer-events-none absolute -right-3 -top-3 rounded-full border border-border bg-surface px-3 py-1 text-[11px] font-semibold text-accent shadow-sm">
                  {t('home.local100')}
                </div>
              </div>
            </div>
          </div>
        </SectionReveal>
      </section>

      {/* ─────────────────────────── CTA ─────────────────────────── */}
      <section className="mx-auto w-full max-w-7xl px-5 pb-16 sm:px-8">
        <SectionReveal>
          <FooterCTA />
        </SectionReveal>
      </section>

      {/* ─────────────────────── WELCOME MODAL (preserved) ─────── */}
      {showWelcome && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={dismissWelcome}
        >
          <div
            className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={dismissWelcome}
              className="absolute right-3 top-3 rounded-md p-1 text-text-muted hover:bg-surface-2 hover:text-text-strong"
              aria-label={t('common.close')}
            >
              <X size={18} />
            </button>
            <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-white">
              <Sparkles size={20} />
            </div>
            <h2 className="text-xl font-semibold text-text-strong">{t('home.welcomeTitle')}</h2>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              {t('home.welcomeBody')}
            </p>
            <button
              onClick={dismissWelcome}
              className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              {t('home.welcomeOk')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
