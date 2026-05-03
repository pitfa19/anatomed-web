import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Box } from 'lucide-react';
import { useReducedMotion } from '../../lib/useReducedMotion';

const IsolatedBonesCanvas = lazy(() => import('./IsolatedBonesCanvas'));

const FEMUR_IDS = ['Femur.r'];

export default function BentoViewerTile({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  return (
    <Link
      to="/viewer?part=Femur.r"
      className={
        'group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-surface p-5 transition-all hover:border-accent/40 hover:bg-surface-2 ' +
        (className ?? '')
      }
    >
      <div className="flex items-start justify-between">
        <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-text-muted">
          <Box size={13} className="text-accent" />
          3D viewer
        </span>
        <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-[10px] uppercase tracking-wider text-text-muted">
          beta
        </span>
      </div>

      <div className="relative my-4 flex flex-1 items-center justify-center">
        <div className="relative h-40 w-full sm:h-48">
          {!reduced && (
            <Suspense fallback={null}>
              <IsolatedBonesCanvas
                partIds={FEMUR_IDS}
                reduced={reduced}
                rotationSpeed={0.5}
                marginScale={1.25}
                fov={28}
              />
            </Suspense>
          )}
          {/* tiny floating chip for context */}
          <div className="pointer-events-none absolute bottom-1 right-1 rounded-md border border-border bg-surface/85 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-text-muted backdrop-blur">
            Femur
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-base font-semibold text-text-strong">Izoliraj i rotiraj traženi dio</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-text-muted">
          Učitaj cijeli sustav i izdvoji samo dio koji te zanima - kao u Unityju, ali u browseru.
        </p>
      </div>
    </Link>
  );
}
