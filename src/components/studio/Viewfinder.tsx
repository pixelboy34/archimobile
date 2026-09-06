export function Viewfinder() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[5] mix-blend-screen">
      <span className="vf-arm vf-tl" />
      <span className="vf-arm vf-tr" />
      <span className="vf-arm vf-bl" />
      <span className="vf-arm vf-br" />
      <span className="absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/80" />
      <span className="absolute top-1/2 left-[12%] h-px w-6 bg-accent/40" />
      <span className="absolute top-1/2 right-[12%] h-px w-6 bg-accent/40" />
    </div>
  );
}
