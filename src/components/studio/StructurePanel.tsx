import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { analyzeStructure, markLoadBearing, type IssueLevel, type StructureIssue } from "@/lib/bim/structure";
import { mergeDetectedRooms } from "@/lib/bim/rooms";
import { healWallEnds } from "@/lib/cad/ops";
import { cn, formatMeters } from "@/lib/utils";
import { useStudio } from "@/lib/store/project-store";
import { Button } from "@/components/ui/button";
import { SheetClose } from "@/components/ui/sheet";
import { toast } from "sonner";

const SYSTEM: Record<string, string> = {
  murs: "Murs porteurs",
  poteaux: "Poteaux-poutres",
  mixte: "Mixte murs + poteaux",
};

const LEVEL_LABEL: Record<IssueLevel, string> = {
  crit: "Critique",
  warn: "À vérifier",
  info: "Note",
};

const LEVEL_RANK: Record<IssueLevel, number> = { crit: 0, warn: 1, info: 2 };

/**
 * Le rapport ne transporte que des phrases : on les ramene a une nature pour
 * regrouper. Sur un R+8, les memes deux defauts se repetaient niveau par
 * niveau en 64 boutons de 62 px, soit 6 124 px de contenu dans 347 px de
 * fenetre — un seul bouton visible a l'ouverture, 5 780 px de defilement pour
 * atteindre le dernier mur.
 */
const NATURES: { re: RegExp; label: string }[] = [
  { re: /vitr/i, label: "Mur vitré déclaré porteur" },
  { re: /élancement/i, label: "Élancement au-delà de 27 (L/e)" },
  { re: /longueur libre/i, label: "Longueur libre sans contreventement" },
  { re: /baies/i, label: "Baies majoritaires, linteau à prévoir" },
  { re: /extrémité/i, label: "Extrémité de porteur non reprise" },
  { re: /non repris au/i, label: "Porteur non repris au niveau inférieur" },
  { re: /portée de plancher/i, label: "Portée de plancher sans reprise" },
  { re: /peu appuyée/i, label: "Dalle peu appuyée" },
  { re: /aucun ouvrage porteur/i, label: "Aucun ouvrage porteur identifié" },
];

interface IssueLine extends StructureIssue {
  story: string | null;
  detail: string;
}

interface IssueGroup {
  key: string;
  level: IssueLevel;
  label: string;
  lines: IssueLine[];
  /** Regroupement interne, un rang par niveau touché. */
  byStory: { story: string; lines: IssueLine[] }[];
}

function natureOf(text: string): string {
  return NATURES.find((n) => n.re.test(text))?.label ?? text;
}

function groupIssues(issues: StructureIssue[], storyNames: Set<string>): IssueGroup[] {
  const groups = new Map<string, IssueGroup>();
  for (const iss of issues) {
    const cut = iss.text.indexOf(" — ");
    const head = cut > 0 ? iss.text.slice(0, cut) : "";
    const story = storyNames.has(head) ? head : null;
    const detail = story ? iss.text.slice(cut + 3) : iss.text;
    const label = natureOf(detail);
    const key = `${iss.level}/${label}`;
    const g =
      groups.get(key) ?? { key, level: iss.level, label, lines: [], byStory: [] };
    g.lines.push({ ...iss, story, detail });
    groups.set(key, g);
  }
  const out = [...groups.values()];
  for (const g of out) {
    const per = new Map<string, IssueLine[]>();
    for (const l of g.lines) {
      const k = l.story ?? "Projet";
      per.set(k, [...(per.get(k) ?? []), l]);
    }
    g.byStory = [...per.entries()].map(([story, lines]) => ({ story, lines }));
  }
  out.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || b.lines.length - a.lines.length);
  return out;
}

const WALLS_FIRST = 6;
const WALLS_STEP = 20;

export function StructurePanel() {
  const project = useStudio((s) => s.projects.find((p) => p.id === s.currentId) ?? null);
  const show = useStudio((s) => s.showStructure);
  const setShow = useStudio((s) => s.setShowStructure);
  const select = useStudio((s) => s.select);
  const setView = useStudio((s) => s.setView);
  const setTool = useStudio((s) => s.setTool);
  const commit = useStudio((s) => s.commit);
  const storyId = useStudio((s) => s.storyId);
  const [open, setOpen] = useState<string | null>(null);
  const [wallsShown, setWallsShown] = useState(WALLS_FIRST);
  if (!project) return <p className="text-sm text-muted">Aucun projet ouvert.</p>;

  // Sans un seul ouvrage, il n'y a pas de descente de charges : l'ancien panneau
  // annonçait quand même « indice 92/100 » et « chemin cohérent » sur 0 ml de
  // porteurs. Noter le vide disqualifie l'outil.
  if (project.walls.length === 0 && project.columns.length === 0 && project.slabs.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <section className="panel-card flex flex-col gap-2 p-3.5">
          <p className="text-[10px] font-medium tracking-[0.18em] text-muted uppercase">
            Rien à analyser
          </p>
          <p className="text-sm text-muted">
            Ce modèle ne contient ni mur, ni poteau, ni dalle. Aucune descente de charges à
            vérifier — un indice de sécurité serait inventé.
          </p>
        </section>
        <SheetClose asChild>
          <Button
            variant="accent"
            onClick={() => {
              setTool("wall");
              setView("plan");
            }}
          >
            Tracer un premier mur
          </Button>
        </SheetClose>
        <p className="text-xs text-subtle">
          Pour un immeuble complet : PARAMS → Étages → Générer (massing R+n avec noyau), puis
          revenez ici.
        </p>
      </div>
    );
  }

  const r = analyzeStructure(project);
  const storyNames = new Set(project.stories.map((s) => s.name));
  const groups = groupIssues(r.issues, storyNames);
  const crit = r.issues.filter((i) => i.level === "crit").length;
  const warn = r.issues.filter((i) => i.level === "warn").length;

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => {
          const next = !show;
          setShow(next);
          if (next) setView("3d");
        }}
        className={`flex h-11 items-center justify-between rounded-xl px-4 text-sm ${
          show ? "bg-primary text-primary-fg" : "bg-elevated"
        }`}
      >
        Isoler la structure
        <span className="font-mono text-xs tabular">{show ? "on" : "off"}</span>
      </button>

      {/* Carte tenue au plus court : l'en-tete de diagnostic — bascule, six
          chiffres et points de vigilance — doit tenir dans les 346 px de la
          feuille, faute de quoi on redescend vers le panneau d'origine ou un
          seul bouton sur 84 etait visible a l'ouverture. */}
      <section className="panel-card flex flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-medium tracking-[0.18em] text-muted uppercase">Système</p>
          <span className="min-w-0 truncate text-[11px] font-semibold text-accent">
            {SYSTEM[r.system] ?? r.system} · indice {r.score}/100
          </span>
        </div>
        <div className="grid grid-cols-3 gap-x-2 gap-y-1">
          <Num k="Porteurs" v={`${r.bearingMl.toFixed(0)} ml`} />
          <Num k="Cloisons" v={`${r.partitionMl.toFixed(0)} ml`} />
          <Num k="Poteaux" v={`${r.columns}`} />
          <Num k="Planchers" v={`${r.slabM2.toFixed(0)} m²`} />
          <Num k="Portée max" v={formatMeters(r.maxSpan)} />
          <Num k="Charge max" v={`${r.maxLineLoad.toFixed(0)} kN/ml`} />
        </div>
      </section>

      <section className="flex flex-col gap-1.5">
        {/* une seule ligne, meme a 320 px : le repli du compteur poussait
            l'en-tete de diagnostic 8 px sous le pli */}
        <p className="flex items-baseline gap-2 text-xs font-medium tracking-wide text-muted uppercase">
          <span className="shrink-0">Points de vigilance</span>
          {r.issues.length > 0 && (
            <span className="min-w-0 truncate font-mono text-[11px] normal-case tabular">
              {crit} critique{crit > 1 ? "s" : ""} · {warn} à vérifier
            </span>
          )}
        </p>
        {groups.length === 0 ? (
          // sans porteur ni poteau declare, « chemin coherent » ne conclurait sur rien
          r.walls.length === 0 && r.columns === 0 ? (
            <p className="text-sm text-muted">
              Aucun porteur ni poteau déclaré : il n’y a pas encore de descente de charges à
              vérifier. Lancez « Déduire les porteurs » plus bas.
            </p>
          ) : (
            <p className="text-sm text-muted">
              Aucun point de vigilance sur les {r.walls.length} porteurs relevés. Chemin de
              descente des charges cohérent.
            </p>
          )
        ) : (
          groups.map((g) => {
            const on = open === g.key;
            return (
              <div key={g.key} className="flex flex-col gap-1">
                <button
                  type="button"
                  aria-expanded={on}
                  onClick={() => setOpen(on ? null : g.key)}
                  className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 py-2 text-left"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-baseline gap-2">
                      <span
                        className={cn(
                          "shrink-0 text-[10px] tracking-wide uppercase",
                          g.level === "crit" ? "text-danger" : g.level === "warn" ? "text-accent" : "text-muted",
                        )}
                      >
                        {LEVEL_LABEL[g.level]}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">{g.label}</span>
                      <span className="shrink-0 font-mono text-[11px] text-subtle tabular">
                        {g.lines.length}
                      </span>
                    </span>
                    <span className="truncate font-mono text-[11px] text-subtle tabular">
                      {g.byStory.map((s) => s.story).join(" · ")}
                    </span>
                  </span>
                  <ChevronDown className={cn("size-4 shrink-0 text-muted", on && "rotate-180")} />
                </button>
                {on &&
                  g.byStory.map((s) => {
                    const ids = s.lines.map((l) => l.id).filter((x): x is string => Boolean(x));
                    return (
                      <button
                        key={s.story}
                        type="button"
                        onClick={() => ids.length > 0 && select(ids)}
                        className="ml-3 flex min-h-11 flex-col justify-center gap-0.5 rounded-lg border border-border/60 px-3 py-2 text-left"
                      >
                        <span className="text-sm">
                          {s.story}
                          <span className="ml-2 font-mono text-[11px] text-subtle tabular">
                            {s.lines.length} ouvrage{s.lines.length > 1 ? "s" : ""}
                          </span>
                        </span>
                        <span className="truncate font-mono text-[11px] text-subtle tabular">
                          {s.lines[0]!.detail}
                        </span>
                      </button>
                    );
                  })}
              </div>
            );
          })
        )}
      </section>

      <section className="flex flex-col gap-2">
        {/* la coupe etait muette : r.walls.slice(0, 16) sur 128 porteurs */}
        <p className="flex items-baseline gap-2 text-xs font-medium tracking-wide text-muted uppercase">
          <span className="shrink-0">Murs porteurs</span>
          {r.walls.length > 0 && (
            <span className="min-w-0 truncate font-mono text-[11px] normal-case tabular">
              {Math.min(wallsShown, r.walls.length)} sur {r.walls.length}, les plus chargés
            </span>
          )}
        </p>
        {r.walls.length === 0 ? (
          <p className="text-sm text-muted">
            Aucun mur porteur. Lancez la déduction ci-dessous ou marquez-les dans Ouvrages.
          </p>
        ) : (
          <>
            {r.walls.slice(0, wallsShown).map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => select([w.id])}
                className="flex min-h-11 flex-col justify-center gap-0.5 rounded-lg border border-border px-3 py-2 text-left"
              >
                <span className="text-sm">
                  {w.story} · {formatMeters(w.length)} · {Math.round(w.thickness * 100)} cm
                </span>
                <span className="font-mono text-[11px] text-subtle tabular">
                  libre {w.unbraced.toFixed(1)} m · L/e {w.slenderness.toFixed(0)} · baies{" "}
                  {Math.round(w.openingRatio * 100)} % · {w.lineLoad.toFixed(0)} kN/ml
                </span>
              </button>
            ))}
            {wallsShown < r.walls.length && (
              <Button variant="subtle" onClick={() => setWallsShown((n) => n + WALLS_STEP)}>
                Afficher {Math.min(WALLS_STEP, r.walls.length - wallsShown)} de plus
              </Button>
            )}
          </>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">Outils</p>
        <Button
          variant="accent"
          onClick={() => {
            const sid = storyId ?? project.stories[0]?.id;
            if (!sid) return;
            commit((p) => {
              p.rooms = mergeDetectedRooms(p, sid);
              return p;
            });
            toast.success("Pièces détectées sur le niveau actif");
          }}
        >
          Détecter pièces
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const sid = storyId ?? project.stories[0]?.id;
            if (!sid) return;
            commit((p) => healWallEnds(p, sid));
            toast.success("Jonctions de murs soignées");
          }}
        >
          Soigner jonctions
        </Button>
        <Button variant="outline" onClick={() => commit((p) => markLoadBearing(p))}>
          Déduire les porteurs (e ≥ 20 cm)
        </Button>
      </section>
    </div>
  );
}

function Num({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[9px] tracking-wide text-muted uppercase">{k}</p>
      <p className="truncate font-mono text-[13px] tabular">{v}</p>
    </div>
  );
}
