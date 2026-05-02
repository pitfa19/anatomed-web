interface Props {
  className?: string;
}

export default function MeshGradientBg({ className }: Props) {
  return (
    <div
      aria-hidden
      className={
        'pointer-events-none absolute inset-0 overflow-hidden ' + (className ?? '')
      }
    >
      <div className="mesh-gradient" />
    </div>
  );
}
