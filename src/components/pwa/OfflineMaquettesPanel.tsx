import { FolderOpen, HardDrive, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  deleteOfflineMaquette,
  listOfflineMaquettes,
  loadOfflineMaquette,
  saveOfflineMaquette,
  type OfflineMaquetteMeta,
} from "@/lib/pwa/offline-maquettes";
import { useStudio } from "@/lib/store/project-store";

export function OfflineMaquettesPanel({ projectId }: { projectId?: string }) {
  const navigate = useNavigate();
  const current = useStudio((s) => s.current);
  const addProject = useStudio((s) => s.addProject);
  const [rows, setRows] = useState<OfflineMaquetteMeta[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    void listOfflineMaquettes()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveCurrent = async () => {
    const proj = current();
    if (!proj) {
      toast.error("Aucun projet ouvert");
      return;
    }
    setBusy(true);
    try {
      const meta = await saveOfflineMaquette(proj);
      toast.success(`Maquette enregistrée · ${meta.name}`);
      refresh();
    } catch {
      toast.error("Enregistrement hors ligne impossible");
    } finally {
      setBusy(false);
    }
  };

  const openRow = async (id: string) => {
    setBusy(true);
    try {
      const project = await loadOfflineMaquette(id);
      if (!project) {
        toast.error("Maquette introuvable");
        return;
      }
      addProject(project);
      toast.success(`Ouvert · ${project.name}`);
      void navigate({ to: "/studio/$projectId", params: { projectId: project.id } });
    } catch {
      toast.error("Chargement impossible");
    } finally {
      setBusy(false);
    }
  };

  const removeRow = async (id: string) => {
    setBusy(true);
    try {
      await deleteOfflineMaquette(id);
      toast("Maquette hors ligne supprimée");
      refresh();
    } catch {
      toast.error("Suppression impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3 rounded-xl border border-accent/25 bg-accent/5 px-3 py-3">
        <HardDrive className="mt-0.5 size-4 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-fg">Maquettes hors ligne</p>
          <p className="text-[11px] text-muted">
            Copies locales (IndexedDB). Disponibles sans réseau — le projet courant reste aussi dans{" "}
            <span className="font-mono text-[10px]">forma-studio-v9</span>.
          </p>
        </div>
      </div>

      <button
        type="button"
        disabled={busy || (!projectId && !current())}
        onClick={() => void saveCurrent()}
        className="studio-tile disabled:opacity-40"
      >
        <span className="studio-tile-icon">
          <Save className="size-4" />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-sm font-medium text-fg">Enregistrer la maquette actuelle</span>
          <span className="block text-[11px] text-muted">Snapshot nommé pour l’avion / hors ligne</span>
        </span>
      </button>

      {rows.length === 0 ? (
        <p className="px-1 text-[11px] text-subtle">Aucune maquette hors ligne pour l’instant.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-2 rounded-xl border border-border bg-surface/80 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{row.name}</p>
                <p className="text-[10px] text-muted">
                  {new Date(row.savedAt).toLocaleString("fr-FR")} · {row.wallCount} murs ·{" "}
                  {row.storyCount} niveaux
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                aria-label="Ouvrir"
                onClick={() => void openRow(row.id)}
                className="flex size-10 items-center justify-center rounded-full border border-border text-accent"
              >
                <FolderOpen className="size-4" />
              </button>
              <button
                type="button"
                disabled={busy}
                aria-label="Supprimer"
                onClick={() => void removeRow(row.id)}
                className="flex size-10 items-center justify-center rounded-full border border-border text-muted"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
