import { Copy, Link2, Radio, Share2, Users, Wifi } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadText, exportBimJson, shareProject } from "@/lib/bim/quantities";
import { normalizeRoomCode } from "@/lib/multiplayer/collab";
import {
  buildCollabUrl,
  buildNetworkHint,
  CollabQr,
  isLocalHostname,
} from "@/lib/qr/collab-qr";
import { useStudio } from "@/lib/store/project-store";
import { cn } from "@/lib/utils";

function peerStatusLabel(state: string): string {
  if (state === "connected") return "connecté";
  if (state === "connecting" || state === "new" || state === "checking") return "connexion…";
  if (state === "failed") return "échec";
  if (state === "disconnected" || state === "closed") return "coupé";
  return state;
}

function peerStatusColor(state: string): string {
  if (state === "connected") return "text-accent";
  if (state === "connecting" || state === "new" || state === "checking") return "text-amber-400";
  if (state === "failed" || state === "disconnected" || state === "closed") return "text-danger";
  return "text-muted";
}

function peerDotColor(state: string): string {
  if (state === "connected") return "bg-accent";
  if (state === "connecting" || state === "new" || state === "checking") return "bg-amber-400 animate-pulse";
  if (state === "failed" || state === "disconnected" || state === "closed") return "bg-danger";
  return "bg-muted";
}

export function CollabPanel() {
  const project = useStudio((s) => s.projects.find((p) => p.id === s.currentId) ?? null);
  const collabRoom = useStudio((s) => s.collabRoom);
  const collabPeers = useStudio((s) => s.collabPeers);
  const collabStatus = useStudio((s) => s.collabStatus);
  const collabLocalEpoch = useStudio((s) => s.collabLocalEpoch);
  const collabReceivedEpoch = useStudio((s) => s.collabReceivedEpoch);
  const startCollab = useStudio((s) => s.startCollab);
  const stopCollab = useStudio((s) => s.stopCollab);
  const pushCollabProject = useStudio((s) => s.pushCollabProject);
  const [joinCode, setJoinCode] = useState("");

  const onLocalhost = useMemo(() => {
    if (typeof window === "undefined") return true;
    return isLocalHostname(window.location.hostname);
  }, []);

  const networkHint = useMemo(() => buildNetworkHint(), []);

  const collabLink = useMemo(() => {
    if (!collabRoom) return "";
    return buildCollabUrl(collabRoom);
  }, [collabRoom]);

  const lanLinkHint = useMemo(() => {
    if (!collabRoom) return "";
    return `${networkHint}/?collab=${collabRoom}`;
  }, [collabRoom, networkHint]);

  /** QR only when the page is already on a LAN/public host — placeholder IPs are not scannable. */
  const qrValue = !onLocalhost && collabRoom ? collabLink : "";

  const copyRoom = async () => {
    if (!collabRoom) return;
    try {
      await navigator.clipboard.writeText(collabRoom);
      toast.success("Code copié");
    } catch {
      toast.message(collabRoom);
    }
  };

  const copyLink = async () => {
    const link = onLocalhost ? lanLinkHint : collabLink || lanLinkHint;
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success(onLocalhost ? "Lien type copié — remplacez 192.168.x.x" : "Lien copié");
    } catch {
      toast.message(link);
    }
  };

  const fallbackShare = async () => {
    if (!project) return;
    try {
      await shareProject(project);
    } catch {
      downloadText(
        `${project.name.replace(/\s+/g, "-").toLowerCase()}.forma.json`,
        exportBimJson(project),
      );
      toast.message("JSON téléchargé");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="panel-card flex flex-col gap-2 p-3.5">
        <div className="flex items-center gap-2">
          <Wifi className="size-4 text-accent" />
          <p className="text-[10px] font-medium tracking-[0.18em] text-muted uppercase">
            Même réseau
          </p>
        </div>
        <p className="text-sm text-muted">
          Les deux appareils doivent ouvrir la même adresse Network (pas localhost) :
        </p>
        <p className="font-mono text-xs text-accent break-all">{networkHint}</p>
        {onLocalhost && (
          <p className="rounded-xl border border-amber-400/35 bg-amber-400/10 px-3 py-2.5 text-[12px] leading-snug text-amber-200">
            Vous êtes sur localhost — le QR ne marchera pas depuis un téléphone. Ouvrez d’abord
            l’URL Network affichée par Vite (ex. http://192.168.…:8080) sur les deux appareils,
            puis créez le salon.
          </p>
        )}
      </section>

      {!collabRoom ? (
        <section className="flex flex-col gap-3">
          <p className="text-[10px] font-medium tracking-[0.18em] text-muted uppercase">Salon</p>
          <Button
            variant="accent"
            className="h-12 min-h-11"
            onClick={() => startCollab()}
            disabled={!project}
          >
            <Radio className="size-4" />
            Créer un salon
          </Button>
          <div className="flex gap-2">
            <Input
              value={joinCode}
              onChange={(e) => setJoinCode(normalizeRoomCode(e.target.value))}
              placeholder="Code à 6 caractères"
              maxLength={6}
              className="h-11 font-mono uppercase tracking-[0.2em]"
              aria-label="Code salon"
            />
            <Button
              variant="outline"
              className="h-11 min-h-11 shrink-0 px-4"
              disabled={joinCode.length < 4 || !project}
              onClick={() => {
                startCollab(joinCode);
                setJoinCode("");
              }}
            >
              <Link2 className="size-4" />
              Rejoindre
            </Button>
          </div>
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium tracking-[0.18em] text-muted uppercase">
              Salon actif
            </p>
            {collabStatus === "reconnecting" && (
              <span className="rounded-full bg-amber-400/15 px-2.5 py-1 text-[11px] font-medium text-amber-400">
                Reconnexion…
              </span>
            )}
            {collabStatus === "live" && (
              <span className="rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-medium text-accent">
                En ligne
              </span>
            )}
            {collabStatus === "idle" && (
              <span className="rounded-full bg-muted/20 px-2.5 py-1 text-[11px] font-medium text-muted">
                En attente
              </span>
            )}
          </div>

          <div className="panel-card flex flex-col items-center gap-3 p-4">
            <p className="font-mono text-2xl font-semibold tracking-[0.35em] text-fg">
              {collabRoom}
            </p>
            {qrValue ? (
              <>
                <CollabQr
                  value={qrValue}
                  size={200}
                  className="overflow-hidden rounded-xl ring-1 ring-accent/30 [&_svg]:h-full [&_svg]:w-full"
                />
                <p className="text-center text-[11px] text-subtle">
                  Scannez avec l’autre téléphone · même Wi‑Fi
                </p>
              </>
            ) : (
              <p className="max-w-xs text-center text-[12px] leading-snug text-amber-200/90">
                QR indisponible sur localhost — partagez le code à 6 caractères ou le lien Network.
              </p>
            )}
            <p className="max-w-full truncate font-mono text-[10px] text-muted">
              {onLocalhost ? lanLinkHint : collabLink}
            </p>
            <div className="flex w-full gap-2">
              <Button variant="outline" className="h-11 min-h-11 flex-1" onClick={() => void copyRoom()}>
                <Copy className="size-4" />
                Copier le code
              </Button>
              <Button variant="accent" className="h-11 min-h-11 flex-1" onClick={() => void copyLink()}>
                <Link2 className="size-4" />
                Copier le lien
              </Button>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2">
              <Users className="size-3.5 text-accent" />
              <p className="text-[10px] font-medium tracking-[0.18em] text-muted uppercase">
                Pairs ({collabPeers.length})
              </p>
              <span className="ml-auto font-mono text-[10px] text-subtle">
                époch {collabLocalEpoch}/{collabReceivedEpoch}
              </span>
            </div>
            {collabPeers.length === 0 ? (
              <p className="text-sm text-subtle">En attente d’un second appareil…</p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border/60 bg-elevated/60">
                {collabPeers.map((p) => (
                  <li key={p.id} className="flex min-h-11 items-center justify-between gap-2 px-3 py-2.5 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn("size-2 shrink-0 rounded-full", peerDotColor(p.connectionState))}
                        aria-hidden
                      />
                      <span className="truncate text-fg">{p.name || p.id}</span>
                    </span>
                    <span className={cn("shrink-0 text-[11px] font-medium", peerStatusColor(p.connectionState))}>
                      {collabStatus === "reconnecting" && p.connectionState !== "connected"
                        ? "Reconnexion…"
                        : peerStatusLabel(p.connectionState)}
                      {p.rttMs != null && p.connectionState === "connected"
                        ? ` · ${p.rttMs} ms`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Button variant="accent" className="h-12 min-h-11" onClick={() => pushCollabProject()}>
            Envoyer maquette
          </Button>
          <p className="text-[11px] text-subtle">
            Envoi manuel, ou auto toutes les 8 s dès qu’un pair est connecté. En cas de conflit, un toast propose « Prendre le distant » ou « Garder le mien ».
          </p>
          <Button variant="outline" className="h-11 min-h-11" onClick={() => stopCollab()}>
            Quitter le salon
          </Button>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <p className="text-[10px] font-medium tracking-[0.18em] text-muted uppercase">Secours</p>
        <p className="text-sm text-muted">
          Si WebRTC échoue (NAT strict), partagez le JSON via le système.
        </p>
        <Button variant="subtle" className="h-11 min-h-11" onClick={() => void fallbackShare()} disabled={!project}>
          <Share2 className="size-4" />
          Partager / télécharger JSON
        </Button>
      </section>
    </div>
  );
}
