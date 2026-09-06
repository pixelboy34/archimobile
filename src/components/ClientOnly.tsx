import { useEffect, useState, type ReactNode } from "react";

export function ClientOnly({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return <>{fallback ?? null}</>;
  return <>{children}</>;
}
