import { useMemo } from "react";
import { renderSVG } from "uqr";

/** Prefer the live page origin; swap localhost for a LAN placeholder host hint. */
export function buildCollabUrl(code: string, hostnameHint?: string): string {
  if (typeof window === "undefined") {
    return `http://192.168.x.x:8080/?collab=${code}`;
  }
  const { protocol, hostname, port } = window.location;
  const host =
    hostnameHint ||
    (hostname === "localhost" || hostname === "127.0.0.1" ? hostname : hostname);
  const p = port ? `:${port}` : "";
  return `${protocol}//${host}${p}/?collab=${encodeURIComponent(code)}`;
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
