import { useMemo, useState } from "react";
import { AlertTriangle, Crosshair, Download, Hash, ListRestart, Plus, Table2, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  NOM_TITLES,
  buildNomenclature,
  exportAllNomenclaturesCsv,
  exportNomenclatureCsv,
  formatEuro,
  type NomKind,
} from "@/lib/bim/nomenclature";
import {
  KEYNOTE_LOTS,
  buildKeynoteLegend,
  checkKeynotes,
  compareKeynoteCodes,
  exportKeynotesCsv,
  lotLabel,
  lotNumber,
} from "@/lib/bim/keynotes";
import { downloadText } from "@/lib/bim/quantities";
import { cn } from "@/lib/utils";
import { useStudio } from "@/lib/store/project-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const TABS: NomKind[] = ["postes", "murs", "portes", "fenetres", "pieces", "objets", "matieres"];

type PanelTab = NomKind | "reperes";

export function NomenclaturePanel() {
  const project = useStudio((s) => s.projects.find((p) => p.id === s.currentId) ?? null);
  const storyId = useStudio((s) => s.storyId);
  const select = useStudio((s) => s.select);
  const setIsolate = useStudio((s) => s.setIsolateStory);
  const setStory = useStudio((s) => s.setStory);
  const [kind, setKind] = useState<PanelTab>("portes");
  const [levelOnly, setLevelOnly] = useState(false);

  const nom = useMemo(() => {
    if (!project || kind === "reperes") return null;
    return buildNomenclature(project, kind, levelOnly ? storyId : null);
  }, [project, kind, levelOnly, storyId]);

  if (!project) return <p className="text-sm text-muted">Aucun projet ouvert.</p>;

  const slug = project.name.replace(/\s+/g, "-").toLowerCase();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
          {kind === "reperes" ? <Tag className="ico-live size-5" /> : <Table2 className="ico-live size-5" />}
        </div>
        <div className="min-w-0">
          <p className="font-display text-base font-semibold">Nomenclatures</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            {kind === "reperes"
              ? "Le texte n’est écrit qu’ici ; les plans ne portent que le code."
              : "Listes groupées depuis le modèle. Tapez une ligne pour cadrer l’ouvrage."}
          </p>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setKind(id)}
            className={cn(
              "h-8 shrink-0 rounded-full px-2.5 text-[11px] font-medium",
              kind === id ? "bg-accent/15 text-accent ring-1 ring-accent/40" : "bg-elevated text-fg/80",
            )}
          >
            {NOM_TITLES[id]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setKind("reperes")}
          className={cn(
            "h-8 shrink-0 rounded-full px-2.5 text-[11px] font-medium",
            kind === "reperes" ? "bg-accent/15 text-accent ring-1 ring-accent/40" : "bg-elevated text-fg/80",
          )}
        >
          Repères
        </button>
      </div>

      {kind === "reperes" || !nom ? (
        <KeynoteBase />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLevelOnly(false)}
              className={cn("h-8 rounded-full px-2.5 text-[11px] font-medium", !levelOnly ? "bg-accent/15 text-accent" : "text-muted")}
            >
              Tous les niveaux
            </button>
            <button
              type="button"
              onClick={() => setLevelOnly(true)}
              className={cn("h-8 rounded-full px-2.5 text-[11px] font-medium", levelOnly ? "bg-accent/15 text-accent" : "text-muted")}
            >
              {project.stories.find((s) => s.id === storyId)?.name ?? "Niveau"}
            </button>
            <span className="ml-auto font-mono text-[11px] text-muted tabular">
              {nom.rows.length} ligne{nom.rows.length > 1 ? "s" : ""}
            </span>
          </div>

          {nom.rows.length === 0 ? (
            <p className="rounded-xl bg-elevated px-3 py-6 text-center text-sm text-muted">
              Rien à lister sur ce filtre.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {nom.rows.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="flex w-full items-baseline gap-2 px-3 py-2.5 text-left hover:bg-elevated/80"
                    onClick={() => {
                      if (!r.entityIds.length) return;
                      select(r.entityIds);
                      const first = r.entityIds[0]!;
                      const wall = project.walls.find((w) => w.id === first);
                      const furn = project.furniture.find((f) => f.id === first);
                      const room = project.rooms.find((x) => x.id === first);
                      const op = project.openings.find((o) => o.id === first);
                      const sid =
                        wall?.storyId ??
                        furn?.storyId ??
                        room?.storyId ??
                        (op ? project.walls.find((w) => w.id === op.wallId)?.storyId : undefined);
                      if (sid) {
                        setStory(sid);
                        setIsolate(true);
                      }
                    }}
                  >
                    <span className="w-10 shrink-0 font-mono text-[10px] font-semibold tracking-wide text-accent">
                      {r.mark}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-fg">{r.label}</span>
                      <span className="block truncate text-[11px] text-muted">
                        {r.story} · {r.spec}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-mono text-[12px] tabular text-fg">
                        {r.qty.toLocaleString("fr-FR")} {r.unit}
                      </span>
                      {r.total > 0 && (
                        <span className="block font-mono text-[10px] text-muted tabular">{formatEuro(r.total)}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-baseline justify-between rounded-lg bg-elevated px-3 py-2.5">
            <span className="text-sm">Total HT · {nom.title}</span>
            <span className="font-display text-lg font-semibold tabular">{formatEuro(nom.totalHT)}</span>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                downloadText(`${slug}-${kind}.csv`, exportNomenclatureCsv(nom, project.name), "text/csv");
                toast.success(`${nom.title} · CSV`);
              }}
            >
              <Download className="size-4" />
              Cette liste
            </Button>
            <Button
              variant="accent"
              className="flex-1"
              onClick={() => {
                downloadText(`${slug}-nomenclatures.csv`, exportAllNomenclaturesCsv(project), "text/csv");
                toast.success("Toutes les nomenclatures");
              }}
            >
              <Download className="size-4" />
              Tout
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Brouillon de saisie découplé de la base : chaque frappe passerait sinon par
 * `commit`, et vingt caractères videraient les quarante pas d'annulation.
 */
function TexteField({ keyId, value, onCommit }: { keyId: string; value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  // Resynchronisé sur la base quand elle bouge sous le champ — une annulation,
  // par exemple : la valeur ne change pas pendant la frappe, seulement au commit.
  const [live, setLive] = useState(`${keyId}|${value}`);
  if (live !== `${keyId}|${value}`) {
    setLive(`${keyId}|${value}`);
    setDraft(value);
  }
  return (
    <Input
      value={draft}
      placeholder="Désignation courte, portée en légende"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

function DetailField({ keyId, value, onCommit }: { keyId: string; value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [live, setLive] = useState(`${keyId}|${value}`);
  if (live !== `${keyId}|${value}`) {
    setLive(`${keyId}|${value}`);
    setDraft(value);
  }
  return (
    <Textarea
      value={draft}
      rows={2}
      className="min-h-16"
      placeholder="Spécification longue · imprimée au dossier, jamais sur le plan"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft.trim())}
    />
  );
}

/** Base des repères : créer, éditer, appeler, contrôler. */
function KeynoteBase() {
  const project = useStudio((s) => s.projects.find((p) => p.id === s.currentId) ?? null);
  const storyId = useStudio((s) => s.storyId);
  const selectedIds = useStudio((s) => s.selectedIds);
  const addKeynote = useStudio((s) => s.addKeynote);
  const updateKeynote = useStudio((s) => s.updateKeynote);
  const removeKeynote = useStudio((s) => s.removeKeynote);
  const renumber = useStudio((s) => s.renumberKeynoteBase);
  const callKeynote = useStudio((s) => s.callKeynote);
  const removeKeynoteRef = useStudio((s) => s.removeKeynoteRef);
  const [openId, setOpenId] = useState<string | null>(null);

  const notes = useMemo(() => project?.keynotes ?? [], [project]);
  const refs = useMemo(() => project?.keynoteRefs ?? [], [project]);

  const issues = useMemo(() => (project ? checkKeynotes(project) : []), [project]);
  const legendHere = useMemo(
    () => (project ? buildKeynoteLegend(project, storyId) : null),
    [project, storyId],
  );

  const callsOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of refs) m.set(r.keynoteId, (m.get(r.keynoteId) ?? 0) + 1);
    return m;
  }, [refs]);

  const sorted = useMemo(() => [...notes].sort((a, b) => compareKeynoteCodes(a.code, b.code)), [notes]);

  if (!project) return null;

  const slug = project.name.replace(/\s+/g, "-").toLowerCase();
  const storyName = project.stories.find((s) => s.id === storyId)?.name ?? "ce niveau";
  const errors = issues.filter((i) => i.severity === "erreur");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-lg bg-elevated px-3 py-2">
        <Hash className="size-4 shrink-0 text-accent" />
        <span className="text-[12px] text-fg">
          {notes.length} repère{notes.length > 1 ? "s" : ""} · {refs.length} appel{refs.length > 1 ? "s" : ""}
        </span>
        <span className="ml-auto font-mono text-[11px] text-muted tabular">
          {legendHere?.noteCount ?? 0} en légende {storyName}
        </span>
      </div>

      {issues.length > 0 && (
        <div className="rounded-xl border border-border">
          <p className="flex items-center gap-2 border-b border-border px-3 py-2 text-[11px] font-semibold text-fg">
            <AlertTriangle className={cn("size-3.5", errors.length ? "text-danger" : "text-muted")} />
            Incohérences · {issues.length}
          </p>
          <ul className="divide-y divide-border">
            {issues.map((i, n) => (
              <li key={`${i.kind}-${i.keynoteId ?? i.refId ?? n}`} className="flex items-center gap-2 px-3 py-2">
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    i.severity === "erreur" ? "bg-danger" : "bg-muted",
                  )}
                />
                <span className="min-w-0 flex-1 text-[11px] leading-snug text-muted">{i.message}</span>
                {i.refId && (
                  <button
                    type="button"
                    className="h-8 shrink-0 rounded-full px-2 text-[11px] font-medium text-accent"
                    onClick={() => removeKeynoteRef(i.refId!)}
                  >
                    Retirer
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="rounded-xl bg-elevated px-3 py-6 text-center text-sm text-muted">
          Aucun repère. Créez-en un, puis appelez-le depuis un ouvrage sélectionné.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {sorted.map((k) => {
            const open = openId === k.id;
            const count = callsOf.get(k.id) ?? 0;
            return (
              <li key={k.id}>
                <button
                  type="button"
                  className="flex w-full items-baseline gap-2 px-3 py-2.5 text-left hover:bg-elevated/80"
                  onClick={() => setOpenId(open ? null : k.id)}
                >
                  <span className="w-10 shrink-0 font-mono text-[11px] font-semibold tracking-wide text-accent tabular">
                    {k.code}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-fg">{k.texte}</span>
                    <span className="block truncate text-[11px] text-muted">{lotLabel(k.lot)}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] tabular text-muted">
                    {count === 0 ? "—" : `${count}×`}
                  </span>
                </button>

                {open && (
                  <div className="flex flex-col gap-2 border-t border-border bg-elevated/40 px-3 py-3">
                    <TexteField
                      keyId={k.id}
                      value={k.texte}
                      onCommit={(v) => updateKeynote(k.id, { texte: v })}
                    />
                    <DetailField
                      keyId={k.id}
                      value={k.detail ?? ""}
                      onCommit={(v) => updateKeynote(k.id, { detail: v })}
                    />
                    <div className="flex gap-1 overflow-x-auto">
                      {KEYNOTE_LOTS.map((l) => (
                        <button
                          key={l.num}
                          type="button"
                          onClick={() => updateKeynote(k.id, { lot: l.label })}
                          className={cn(
                            "h-9 shrink-0 rounded-full px-2.5 text-[11px] font-medium",
                            lotNumber(k.lot) === l.num
                              ? "bg-accent/15 text-accent ring-1 ring-accent/40"
                              : "bg-elevated text-fg/80",
                          )}
                        >
                          {String(l.num).padStart(2, "0")} {l.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="accent"
                        className="flex-1"
                        onClick={() => {
                          const id = callKeynote(k.id);
                          if (!id) {
                            toast.error("Aucun niveau où poser l’appel");
                            return;
                          }
                          toast.success(
                            selectedIds.length ? `${k.code} appelé sur la sélection` : `${k.code} posé sur ${storyName}`,
                          );
                        }}
                      >
                        <Crosshair className="size-4" />
                        Appeler
                      </Button>
                      <Button variant="danger" onClick={() => removeKeynote(k.id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex gap-2">
        <Button
          variant="accent"
          className="flex-1"
          onClick={() => {
            const id = addKeynote();
            if (id) setOpenId(id);
          }}
        >
          <Plus className="size-4" />
          Nouveau
        </Button>
        <Button variant="outline" onClick={renumber} title="Renuméroter par lot">
          <ListRestart className="size-4" />
        </Button>
        <Button
          variant="outline"
          disabled={notes.length === 0}
          onClick={() => {
            downloadText(`${slug}-reperes.csv`, exportKeynotesCsv(project), "text/csv");
            toast.success("Repères · CSV");
          }}
        >
          <Download className="size-4" />
        </Button>
      </div>
    </div>
  );
}
