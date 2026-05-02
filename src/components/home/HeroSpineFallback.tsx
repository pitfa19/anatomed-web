/**
 * Static SVG sketch of a vertebral column — used as Suspense fallback for
 * HeroSpineCanvas and as the reduced-motion replacement.
 */
export default function HeroSpineFallback() {
  const N = 14;
  return (
    <svg
      viewBox="0 0 200 360"
      aria-hidden
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="spine-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f0e8d8" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#e6d6c0" stopOpacity="0.95" />
        </linearGradient>
      </defs>
      {Array.from({ length: N }).map((_, i) => {
        const t = i / (N - 1);
        const y = 24 + t * 312;
        // Gentle S-curve.
        const cx = 100 + Math.sin(t * Math.PI * 1.5) * 18;
        const wBody = 36 - t * 4; // narrower up top
        const hBody = 14;
        return (
          <g key={i}>
            {/* Vertebral body (front view: oval) */}
            <ellipse
              cx={cx}
              cy={y}
              rx={wBody / 2}
              ry={hBody / 2}
              fill="url(#spine-grad)"
              opacity={0.9}
            />
            {/* Transverse processes (wings) */}
            <rect
              x={cx - wBody / 2 - 10}
              y={y - 2}
              width={10}
              height={4}
              rx={2}
              fill="url(#spine-grad)"
              opacity={0.7}
            />
            <rect
              x={cx + wBody / 2}
              y={y - 2}
              width={10}
              height={4}
              rx={2}
              fill="url(#spine-grad)"
              opacity={0.7}
            />
            {/* Spinous process (line going back, render as dot) */}
            <circle cx={cx} cy={y} r={2.4} fill="#ffffff" opacity={0.6} />
          </g>
        );
      })}
    </svg>
  );
}
