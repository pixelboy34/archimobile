import { Copy, Link2, Radio, Share2, Users, Wifi } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadText, exportBimJson, shareProject } from "@/lib/bim/quantities";
import { normalizeRoomCode } from "@/lib/multiplayer/collab";
import { useStudio } from "@/lib/store/project-store";

function peerStatusLabel(state: string): string {
  if (state === "connected") return "connecté";
  if (state === "connecting" || state === "new" || state === "checking") return "connexion…";
  if (state === "failed") return "échec";
  if (state === "disconnected" || state === "closed") return "coupé";
  return state;
}

export function CollabPanel() {
  const project = useStudio((s) => s.projects.find((p) => p.id === s.currentId) ?? null);
  const collabRoom = useStudio((s) => s.collabRoom);
  const collabPeers = useStudio((s) => s.collabPeers);
  const startCollab = useStudio((s) => s.startCollab);
  const stopCollab = useStudio((s) => s.stopCollab);
  const pushCollabProject = useStudio((s) => s.pushCollabProject);
  const [joinCode, setJoinCode] = useState("");

  const networkHint = useMemo(() => {
    if (typeof window === "undefined") return "http://192.168.x.x:8080";
    const { protocol, hostname, port } = window.location;
    const host = hostname === "localhost" || hostname === "127.0.0.1" ? "192.168.x.x" : hostname;
    const p = port ? `:${port}` : "";
    return `${protocol}//${host}${p}`;
  }, []);

  const copyRoom = async () => {
    if (!collabRoom) return;
    try {
      await navigator.clipboard.writeText(collabRoom);
      toast.success("Code copié");
    } catch {
      toast.message(collabRoom);
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
      </section>

      {!collabRoom ? (
        <section className="flex flex-col gap-3">
          <p className="text-[10px] font-medium tracking-[0.18em] text-muted uppercase">Salon</p>
          <Button
            variant="accent"
            className="h-12"
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
              className="font-mono uppercase tracking-[0.2em]"
              aria-label="Code salon"
            />
            <Button
              variant="outline"
              className="shrink-0"
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
          <p className="text-[10px] font-medium tracking-[0.18em] text-muted uppercase">
            Salon actif
          </p>
          <div className="panel-card flex items-center justify-between gap-3 p-3.5">
            <div>
              <p className="font-mono text-2xl font-semibold tracking-[0.35em] text-fg">
                {collabRoom}
              </p>
              <p className="mt-1 text-[11px] text-subtle">Partagez ce code à l’autre téléphone</p>
            </div>
            <Button variant="outline" size="icon" onClick={() => void copyRoom()} aria-label="Copier">
              <Copy className="size-4" />
            </Button>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2">
              <Users className="size-3.5 text-accent" />
              <p className="text-[10px] font-medium tracking-[0.18em] text-muted uppercase">
                Pairs ({collabPeers.length})
              </p>
            </div>
            {collabPeers.length === 0 ? (
              <p className="text-sm text-subtle">En attente d’un second appareil…</p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border/60 bg-elevated/60">
                {collabPeers.map((p) => (
                  <li key={p.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                    <span className="truncate text-fg">{p.name || p.id}</span>
                    <span
                      className={`text-[11px] font-medium ${
                        p.connectionState === "connected" ? "text-accent" : "text-muted"
                      }`}
                    >
                      {peerStatusLabel(p.connectionState)}
                      {p.rttMs != null && p.connectionState === "connected"
                        ? ` · ${p.rttMs} ms`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Button variant="accent" className="h-12" onClick={() => pushCollabProject()}>
            Envoyer maquette
          </Button>
          <p className="text-[11px] text-subtle">
            Envoi manuel, ou auto toutes les 8 s dès qu’un pair est connecté.
          </p>
          <Button variant="outline" onClick={() => stopCollab()}>
            Quitter le salon
          </Button>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <p className="text-[10px] font-medium tracking-[0.18em] text-muted uppercase">Secours</p>
        <p className="text-sm text-muted">
          Si WebRTC échoue (NAT strict), partagez le JSON via le système.
        </p>
        <Button variant="subtle" onClick={() => void fallbackShare()} disabled={!project}>
          <Share2 className="size-4" />
          Partager / télécharger JSON
        </Button>
      </section>
    </div>
  );
}
