import { useMemo } from "react";
import { renderSVG } from "uqr";

export function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "0.0.0.0"
  );
}

/** Live page origin; keep localhost as-is (caller decides whether QR is usable). */
export function buildCollabUrl(code: string, hostnameHint?: string): string {
  if (typeof window === "undefined") {
    return `http://192.168.x.x:8080/?collab=${code}`;
  }
  const { protocol, hostname, port } = window.location;
  const host = hostnameHint || hostname;
  const p = port ? `:${port}` : "";
  return `${protocol}//${host}${p}/?collab=${encodeURIComponent(code)}`;
}

/** Network tip shown in UI (placeholder when still on localhost). */
export function buildNetworkHint(): string {
  if (typeof window === "undefined") return "http://192.168.x.x:8080";
  const { protocol, hostname, port } = window.location;
  const host = isLocalHostname(hostname) ? "192.168.x.x" : hostname;
  const p = port ? `:${port}` : "";
  return `${protocol}//${host}${p}`;
}

export function CollabQr({
  value,
  size = 180,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const svg = useMemo(
    () =>
      renderSVG(value, {
        ecc: "M",
        border: 2,
        pixelSize: 4,
        whiteColor: "#0f1412",
        blackColor: "#6ed0c3",
      }),
    [value],
  );
  return (
    <div
      className={className}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
      aria-label="QR code salon"
      role="img"
    />
  );
}
