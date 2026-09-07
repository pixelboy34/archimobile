import { CloudOff, Download, Smartphone } from "lucide-react";
import { useFormaPwa } from "@/lib/pwa/use-pwa";

const LABELS = {
  installed: "Installé",
  installable: "Installable",
  offline: "Hors ligne",
  browser: null,
} as const;

export function PwaStatusChip({ className = "" }: { className?: string }) {
  const { state } = useFormaPwa();
  const label = LABELS[state];
  if (!label) return null;

  const Icon = state === "offline" ? CloudOff : state === "installed" ? Smartphone : Download;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[10px] font-medium tracking-wide text-accent ${className}`}
    >
      <Icon className="size-3" />
      {label}
    </span>
  );
}
