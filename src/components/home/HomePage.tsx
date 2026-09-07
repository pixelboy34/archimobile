import { Link, useNavigate } from "@tanstack/react-router";
import { Copy, FileUp, HardDrive, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast, Toaster } from "sonner";
import { PlanThumbnail } from "@/components/plan/PlanThumbnail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { CopilotPanel } from "@/components/studio/CopilotPanel";
import { Onboarding, shouldOnboard } from "@/components/home/Onboarding";
import { InstallBanner } from "@/components/pwa/InstallBanner";
import { PwaStatusChip } from "@/components/pwa/PwaStatusChip";
import { OfflineMaquettesPanel } from "@/components/pwa/OfflineMaquettesPanel";
import { analyzeProject } from "@/lib/bim/analysis";
import { emptyProject } from "@/lib/bim/builder";
import { downloadText, exportBimJson, parseImportedProject } from "@/lib/bim/quantities";
import { formatArea } from "@/lib/utils";
import type { Project } from "@/lib/bim/types";
import { normalizeRoomCode } from "@/lib/multiplayer/collab";
import { useStudio } from "@/lib/store/project-store";

export function HomePage() {
  const navigate = useNavigate();
  const projects = useStudio((s) => s.projects);
  const hydrated = useStudio((s) => s.hydrated);
  const addProject = useStudio((s) => s.addProject);
  const deleteProject = useStudio((s) => s.deleteProject);
  const duplicateProjectById = useStudio((s) => s.duplicateProjectById);
  const resetExamples = useStudio((s) => s.resetExamples);
  const skill = useStudio((s) => s.skill);
  const setSkill = useStudio((s) => s.setSkill);
  const currentId = useStudio((s) => s.currentId);
  const [q, setQ] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [offlineOpen, setOfflineOpen] = useState(false);
  const [onboard, setOnboard] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    useStudio.getState().setHydrated(true);
    if (shouldOnboard()) setOnboard(true);
  }, []);

  // Deep link: /?collab=CODE → open a project studio so StudioShell can join
  useEffect(() => {
    if (!hydrated) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("collab");
    if (!raw) return;
    const code = normalizeRoomCode(raw);
    if (code.length < 4) return;
    const state = useStudio.getState();
    let projectId = state.currentId ?? state.projects[0]?.id ?? null;
    if (!projectId) {
      const p = emptyProject("Collab");
      state.addProject(p);
      projectId = p.id;
    }
    // Full assign keeps ?collab= for StudioShell deep-link join + panel open
    window.location.assign(
      `/studio/${encodeURIComponent(projectId)}?collab=${encodeURIComponent(code)}`,
    );
  }, [hydrated, navigate]);

  const filtered = projects.filter((p) => {
    const hay = `${p.name} ${p.meta.location} ${p.meta.brief}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });
  const last = projects.find((p) => p.id === currentId) ?? projects[0];

  const create = () => {
    const p = emptyProject("Esquisse");
    addProject(p);
    navigate({ to: "/studio/$projectId", params: { projectId: p.id } });
  };

  const onImport = (file: File) => {
    void file.text().then((raw) => {
      try {
        const parsed = parseImportedProject(raw) as Project;
        if (!parsed?.id || !parsed.walls || !parsed.stories) throw new Error("invalid");
        addProject(parsed);
        toast.success("Projet BIM importé");
        navigate({ to: "/studio/$projectId", params: { projectId: parsed.id } });
      } catch {
        toast.error("Fichier FORMA JSON invalide");
      }
    });
  };

  return (
    <div className="page-grid min-h-dvh text-fg">
      <Toaster theme="dark" position="top-center" toastOptions={{ className: "forma-toast" }} />
      <header className="px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="led" />
              <p className="hud-label">Atelier 03 · noyau live</p>
            </div>
            <h1 className="mark mt-2 text-[2.6rem] leading-none">FORMA</h1>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <PwaStatusChip />
              <InstallBanner discreet />
              <LiveStamp />
            </div>
            <div className="seg text-[11px] tracking-[0.12em]">
              <button
                type="button"
                onClick={() => setSkill("simple")}
                className={`seg-item h-8 px-3 ${skill === "simple" ? "seg-item-on" : ""}`}
              >
                Amateur
              </button>
              <button
                type="button"
                onClick={() => setSkill("pro")}
                className={`seg-item h-8 px-3 ${skill === "pro" ? "seg-item-on" : ""}`}
              >
                Expert
              </button>
            </div>
          </div>
        </div>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted">
          {skill === "simple"
            ? "Le volume suit le doigt. Posez un mur, laissez l’IA concevoir."
            : "Maquette 3D, relevé, 4D et métré. Le modèle est le chantier."}
        </p>
      </header>

      <div className="flex gap-2 px-5">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un projet"
          className="flex-1"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2 px-5">
        {last && (
          <Button
            className="h-12 w-full rounded-full text-[15px]"
            onClick={() => navigate({ to: "/studio/$projectId", params: { projectId: last.id } })}
          >
            Continuer · {last.name}
          </Button>
        )}
        <Button className="flex-1" variant={last ? "outline" : "default"} onClick={create}>
          <Plus className="ico-live size-4" />
          Nouveau
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => setAiOpen(true)}>
          <Sparkles className="ico-live size-4" />
          Générer
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => fileRef.current?.click()}>
          <FileUp className="ico-live size-4" />
          Importer
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => setOfflineOpen(true)}>
          <HardDrive className="ico-live size-4" />
          Hors ligne
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImport(f);
            e.target.value = "";
          }}
        />
      </div>

      <section className="mt-8 px-5 pb-24">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="font-display text-sm font-semibold tracking-wide text-fg">Archives</h2>
          <button
            type="button"
            className="text-xs text-subtle"
            onClick={() => {
              resetExamples();
              toast.success("Exemples mis à jour");
            }}
          >
            Rafraîchir les exemples
          </button>
        </div>
        {!hydrated ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-48 animate-pulse rounded-xl bg-elevated" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="panel-card px-4 py-12 text-center">
            <span className="led mx-auto mb-3 block" />
            <span className="font-display text-sm font-semibold text-fg">Archives vides</span>
            <span className="mt-1.5 block text-sm text-muted">Créez une esquisse ou générez un massing.</span>
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {filtered.map((p) => {
              const a = analyzeProject(p);
              return (
                <li key={p.id} className="hud-panel archive-card rise-in group relative overflow-hidden">
                  <Link
                    to="/studio/$projectId"
                    params={{ projectId: p.id }}
                    className="block"
                  >
                    <div className="relative">
                      <PlanThumbnail project={p} className="h-36 w-full" />
                      <span className="vf-arm vf-tl" />
                      <span className="vf-arm vf-tr" />
                      <span className="vf-arm vf-bl" />
                      <span className="vf-arm vf-br" />
                    </div>
                    <div className="px-4 pt-3 pb-4">
                      <div className="mark-line mb-2.5" />
                      <p className="font-display text-base font-semibold tracking-tight">{p.name}</p>
                      <p className="mt-0.5 text-xs text-muted">{p.meta.location}</p>
                      <p className="mt-2 font-mono text-xs text-muted tabular">
                        {formatArea(a.netArea)} · {p.stories.length} niv. · {p.rooms.length} pièces
                      </p>
                    </div>
                  </Link>
                  <div className="absolute top-2 right-2 flex gap-1">
                    <button
                      type="button"
                      aria-label="Dupliquer"
                      onClick={() => {
                        const id = duplicateProjectById(p.id);
                        if (id) toast.success("Copie créée");
                      }}
                      className="flex size-10 items-center justify-center rounded-xl border border-border/50 bg-bg/75 text-muted backdrop-blur-sm hover:border-accent/35 hover:text-accent"
                    >
                      <Copy className="ico-live size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Exporter"
                      onClick={() =>
                        downloadText(
                          `${p.name.replace(/\s+/g, "-").toLowerCase()}.forma.json`,
                          exportBimJson(p),
                        )
                      }
                      className="flex size-10 items-center justify-center rounded-xl border border-border/50 bg-bg/75 text-muted backdrop-blur-sm hover:border-accent/35 hover:text-accent"
                    >
                      <FileUp className="ico-live size-4 rotate-180" />
                    </button>
                    <button
                      type="button"
                      aria-label="Supprimer"
                      onClick={() => {
                        if (confirm(`Supprimer « ${p.name} » ?`)) {
                          deleteProject(p.id);
                          toast("Projet retiré");
                        }
                      }}
                      className="flex size-10 items-center justify-center rounded-xl border border-border/50 bg-bg/75 text-muted backdrop-blur-sm hover:border-accent/35 hover:text-accent"
                    >
                      <Trash2 className="ico-live size-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Sheet open={aiOpen} onOpenChange={setAiOpen}>
        <SheetContent title="Générer un massing">
          <CopilotPanel
            onApplied={() => {
              setAiOpen(false);
              const latest = useStudio.getState().currentId;
              if (latest) navigate({ to: "/studio/$projectId", params: { projectId: latest } });
            }}
          />
        </SheetContent>
      </Sheet>
      <Sheet open={offlineOpen} onOpenChange={setOfflineOpen}>
        <SheetContent title="Maquettes hors ligne">
          <OfflineMaquettesPanel />
        </SheetContent>
      </Sheet>
      <InstallBanner />
      {onboard && <Onboarding onDone={() => setOnboard(false)} />}
    </div>
  );
}

function LiveStamp() {
  const [t, setT] = useState("");
  useEffect(() => {
    const tick = () =>
      setT(
        new Date().toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  return <p className="hud-label tabular">{t || "—"}</p>;
}
