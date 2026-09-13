import { lerp, polygonCentroid, wallMid } from "./geometry";
import type { Keynote, KeynoteRef, Project, Vec2 } from "./types";

/**
 * Repères de nomenclature — la base des notes du projet et les appels posés
 * sur les plans.
 *
 * Le texte n'existe qu'à un endroit : dans la base. Les plans ne portent que
 * le code, la légende relit la base. Deux pages du dossier ne peuvent donc
 * plus décrire la même note autrement, faute qui a déjà coûté cher au métré.
 *
 * Tout ce fichier est pur : pas d'horloge, pas d'aléatoire, pas de DOM.
 */

/** Un lot du CCTP : son numéro ouvre le code des repères qui en dépendent. */
export interface KeynoteLot {
  num: number;
  label: string;
}

/** Découpage courant d'un CCTP de bâtiment. Le numéro est la tête du code. */
export const KEYNOTE_LOTS: readonly KeynoteLot[] = [
  { num: 1, label: "Terrassement · VRD" },
  { num: 2, label: "Gros œuvre" },
  { num: 3, label: "Charpente" },
  { num: 4, label: "Couverture" },
  { num: 5, label: "Étanchéité" },
  { num: 6, label: "Menuiseries extérieures" },
  { num: 7, label: "Menuiseries intérieures" },
  { num: 8, label: "Cloisons · doublages" },
  { num: 9, label: "Plomberie · sanitaires" },
  { num: 10, label: "Électricité" },
  { num: 11, label: "Chauffage · ventilation" },
  { num: 12, label: "Revêtements de sol" },
  { num: 13, label: "Peinture" },
  { num: 14, label: "Serrurerie · métallerie" },
  { num: 15, label: "Ascenseur" },
  { num: 16, label: "Aménagements extérieurs" },
];

/** Lot 0 : ce que l'utilisateur n'a pas rattaché. Il sort en tête, pour se voir. */
export const LOT_HORS = "Hors lot";

/**
 * Rapproche « Gros œuvre », « gros oeuvre » et « GROS ŒUVRE » : sans cela le
 * même lot saisi deux fois ouvrirait deux séries de codes.
 */
function normalizeLot(lot: string): string {
  return lot
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/gi, "oe")
    .replace(/æ/gi, "ae")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const LOT_BY_KEY = new Map<string, KeynoteLot>(
  KEYNOTE_LOTS.map((l) => [normalizeLot(l.label), l]),
);

/**
 * Numéro de lot d'un repère. Un libellé qui commence par un nombre l'emporte
 * — c'est la sortie de secours pour un lot que le catalogue ne connaît pas
 * (« 17 Photovoltaïque »).
 */
export function lotNumber(lot: string | undefined | null): number {
  const raw = (lot ?? "").trim();
  const lead = /^(\d{1,2})\b/.exec(raw);
  if (lead) return Number(lead[1]);
  const known = LOT_BY_KEY.get(normalizeLot(raw));
  return known ? known.num : 0;
}

/** Libellé canonique : celui du catalogue quand il reconnaît le lot. */
export function lotLabel(lot: string | undefined | null): string {
  const raw = (lot ?? "").trim();
  if (!raw) return LOT_HORS;
  const known = LOT_BY_KEY.get(normalizeLot(raw));
  return known ? known.label : raw;
}

/** « 3.02 » — deux chiffres de rang, davantage au-delà du centième repère. */
export function formatKeynoteCode(lotNum: number, rank: number): string {
  return `${lotNum}.${String(rank).padStart(2, "0")}`;
}

export function parseKeynoteCode(code: string | undefined | null): { lotNum: number; rank: number } | null {
  const m = /^(\d{1,2})\.(\d{1,3})$/.exec((code ?? "").trim());
  if (!m) return null;
  const rank = Number(m[2]);
  if (rank < 1) return null;
  return { lotNum: Number(m[1]), rank };
}

/** Tri d'affichage : par lot puis par rang, jamais par ordre lexical du code. */
export function compareKeynoteCodes(a: string, b: string): number {
  const pa = parseKeynoteCode(a);
  const pb = parseKeynoteCode(b);
  if (pa && pb) return pa.lotNum - pb.lotNum || pa.rank - pb.rank;
  if (pa) return -1;
  if (pb) return 1;
  return a.localeCompare(b, "fr");
}

/**
 * Attribue les codes par lot, sous la forme « lot.rang ».
 *
 * Deux exigences opposées : le résultat doit être stable — renuméroter deux
 * fois de suite ne change rien — et un repère ajouté ne doit pas décaler les
 * autres. D'où la règle : un code déjà correct pour son lot, et non encore
 * pris, est conservé ; seuls les repères sans code valide reçoivent le plus
 * petit rang libre de leur lot, dans l'ordre de la base.
 */
export function renumberKeynotes(keynotes: readonly Keynote[]): Keynote[] {
  const taken = new Map<number, Set<number>>();
  const keep = new Map<string, string>();

  for (const k of keynotes) {
    const lotNum = lotNumber(k.lot);
    const parsed = parseKeynoteCode(k.code);
    if (!parsed || parsed.lotNum !== lotNum) continue;
    let set = taken.get(lotNum);
    if (!set) {
      set = new Set();
      taken.set(lotNum, set);
    }
    // Un doublon perd sa place : le premier de la base la garde.
    if (set.has(parsed.rank)) continue;
    set.add(parsed.rank);
    keep.set(k.id, formatKeynoteCode(lotNum, parsed.rank));
  }

  return keynotes.map((k) => {
    const kept = keep.get(k.id);
    if (kept) return kept === k.code ? k : { ...k, code: kept };
    const lotNum = lotNumber(k.lot);
    let set = taken.get(lotNum);
    if (!set) {
      set = new Set();
      taken.set(lotNum, set);
    }
    let rank = 1;
    while (set.has(rank)) rank += 1;
    set.add(rank);
    const code = formatKeynoteCode(lotNum, rank);
    return code === k.code ? k : { ...k, code };
  });
}

/** Prochain code libre d'un lot, sans toucher aux repères existants. */
export function nextKeynoteCode(keynotes: readonly Keynote[], lot: string): string {
  const lotNum = lotNumber(lot);
  const used = new Set<number>();
  for (const k of keynotes) {
    if (lotNumber(k.lot) !== lotNum) continue;
    const p = parseKeynoteCode(k.code);
    if (p && p.lotNum === lotNum) used.add(p.rank);
  }
  let rank = 1;
  while (used.has(rank)) rank += 1;
  return formatKeynoteCode(lotNum, rank);
}

// ---------------------------------------------------------------- appels

export function projectKeynotes(project: Project): Keynote[] {
  return project.keynotes ?? [];
}

export function projectKeynoteRefs(project: Project): KeynoteRef[] {
  return project.keynoteRefs ?? [];
}

/** Position de l'étiquette : l'ancre, décalée si l'architecte l'a déportée. */
export function keynoteLabelAt(ref: KeynoteRef): Vec2 {
  return {
    x: ref.at.x + (ref.offset?.x ?? 0),
    y: ref.at.y + (ref.offset?.y ?? 0),
  };
}

export interface ResolvedKeynoteRef {
  ref: KeynoteRef;
  keynote: Keynote;
  code: string;
  anchor: Vec2;
  label: Vec2;
  /** Vrai quand l'étiquette est déportée : elle appelle alors une amorce. */
  leader: boolean;
}

/**
 * Appels réellement dessinables sur un étage : ceux dont le repère existe.
 * Un appel orphelin ne s'imprime pas — il se signale, voir checkKeynotes.
 */
export function resolveKeynoteRefs(project: Project, storyId?: string | null): ResolvedKeynoteRef[] {
  const base = new Map(projectKeynotes(project).map((k) => [k.id, k]));
  const out: ResolvedKeynoteRef[] = [];
  for (const ref of projectKeynoteRefs(project)) {
    if (storyId && ref.storyId !== storyId) continue;
    const keynote = base.get(ref.keynoteId);
    if (!keynote) continue;
    const label = keynoteLabelAt(ref);
    const dx = label.x - ref.at.x;
    const dy = label.y - ref.at.y;
    out.push({
      ref,
      keynote,
      code: keynote.code,
      anchor: ref.at,
      label,
      leader: Math.hypot(dx, dy) > 0.15,
    });
  }
  out.sort((a, b) => compareKeynoteCodes(a.code, b.code) || a.ref.id.localeCompare(b.ref.id));
  return out;
}

// --------------------------------------------------------------- légende

export interface KeynoteLegendEntry {
  keynote: Keynote;
  code: string;
  /** Nombre d'appels du repère sur le périmètre demandé. */
  count: number;
}

export interface KeynoteLegendGroup {
  lot: string;
  lotNum: number;
  entries: KeynoteLegendEntry[];
}

export interface KeynoteLegend {
  /** null = tout le projet. */
  storyId: string | null;
  groups: KeynoteLegendGroup[];
  /** Repères distincts listés. */
  noteCount: number;
  /** Appels comptés. */
  callCount: number;
}

/**
 * Légende d'un plan : seuls les repères réellement appelés sur cet étage.
 * Une légende qui listerait toute la base mentirait sur la feuille imprimée.
 */
export function buildKeynoteLegend(project: Project, storyId?: string | null): KeynoteLegend {
  const sid = storyId ?? null;
  const counts = new Map<string, number>();
  const base = new Map(projectKeynotes(project).map((k) => [k.id, k]));
  let callCount = 0;
  for (const ref of projectKeynoteRefs(project)) {
    if (sid && ref.storyId !== sid) continue;
    if (!base.has(ref.keynoteId)) continue;
    counts.set(ref.keynoteId, (counts.get(ref.keynoteId) ?? 0) + 1);
    callCount += 1;
  }

  const byLot = new Map<number, KeynoteLegendGroup>();
  for (const k of projectKeynotes(project)) {
    const count = counts.get(k.id);
    if (!count) continue;
    const num = lotNumber(k.lot);
    let g = byLot.get(num);
    if (!g) {
      g = { lot: lotLabel(k.lot), lotNum: num, entries: [] };
      byLot.set(num, g);
    }
    g.entries.push({ keynote: k, code: k.code, count });
  }

  const groups = [...byLot.values()].sort((a, b) => a.lotNum - b.lotNum || a.lot.localeCompare(b.lot, "fr"));
  for (const g of groups) {
    g.entries.sort((a, b) => compareKeynoteCodes(a.code, b.code) || a.keynote.id.localeCompare(b.keynote.id));
  }

  return {
    storyId: sid,
    groups,
    noteCount: groups.reduce((s, g) => s + g.entries.length, 0),
    callCount,
  };
}

// ------------------------------------------------------------- cohérence

export type KeynoteIssueKind =
  | "code-double"
  | "repere-inutilise"
  | "appel-orphelin"
  | "appel-hors-niveau"
  | "cible-absente";

export interface KeynoteIssue {
  kind: KeynoteIssueKind;
  severity: "erreur" | "avertissement";
  message: string;
  keynoteId?: string;
  refId?: string;
  storyId?: string;
}

/** Tous les identifiants d'ouvrages qu'un appel peut légitimement viser. */
function entityIds(project: Project): Set<string> {
  const s = new Set<string>();
  for (const w of project.walls) s.add(w.id);
  for (const o of project.openings) s.add(o.id);
  for (const r of project.rooms) s.add(r.id);
  for (const sl of project.slabs) s.add(sl.id);
  for (const rf of project.roofs) s.add(rf.id);
  for (const c of project.columns) s.add(c.id);
  for (const st of project.stairs) s.add(st.id);
  for (const f of project.furniture) s.add(f.id);
  return s;
}

/**
 * Ce qu'un dossier ne doit pas contenir en partant chez le client.
 * L'ordre est déterministe : erreurs d'abord, puis l'ordre de la base.
 */
export function checkKeynotes(project: Project): KeynoteIssue[] {
  const notes = projectKeynotes(project);
  const refs = projectKeynoteRefs(project);
  const base = new Map(notes.map((k) => [k.id, k]));
  const stories = new Set(project.stories.map((s) => s.id));
  const targets = entityIds(project);

  const called = new Map<string, number>();
  for (const r of refs) called.set(r.keynoteId, (called.get(r.keynoteId) ?? 0) + 1);

  const errors: KeynoteIssue[] = [];
  const warnings: KeynoteIssue[] = [];

  const seenCode = new Map<string, string>();
  for (const k of notes) {
    const code = (k.code ?? "").trim();
    if (!code) {
      errors.push({
        kind: "code-double",
        severity: "erreur",
        message: `« ${k.texte || "repère sans texte"} » n'a pas de code.`,
        keynoteId: k.id,
      });
      continue;
    }
    const first = seenCode.get(code);
    if (first && first !== k.id) {
      errors.push({
        kind: "code-double",
        severity: "erreur",
        message: `Code ${code} porté par deux repères.`,
        keynoteId: k.id,
      });
    } else if (!first) {
      seenCode.set(code, k.id);
    }
  }

  for (const r of refs) {
    if (!base.has(r.keynoteId)) {
      errors.push({
        kind: "appel-orphelin",
        severity: "erreur",
        message: "Un appel désigne un repère supprimé de la base.",
        refId: r.id,
      });
      continue;
    }
    if (!stories.has(r.storyId)) {
      errors.push({
        kind: "appel-hors-niveau",
        severity: "erreur",
        message: `Appel ${base.get(r.keynoteId)!.code} posé sur un niveau supprimé.`,
        refId: r.id,
        keynoteId: r.keynoteId,
        storyId: r.storyId,
      });
      continue;
    }
    if (r.targetId && !targets.has(r.targetId)) {
      warnings.push({
        kind: "cible-absente",
        severity: "avertissement",
        message: `Appel ${base.get(r.keynoteId)!.code} attaché à un ouvrage disparu.`,
        refId: r.id,
        keynoteId: r.keynoteId,
        storyId: r.storyId,
      });
    }
  }

  for (const k of notes) {
    if (called.get(k.id)) continue;
    warnings.push({
      kind: "repere-inutilise",
      severity: "avertissement",
      message: `Repère ${k.code || "sans code"} jamais appelé sur un plan.`,
      keynoteId: k.id,
    });
  }

  return [...errors, ...warnings];
}

// ------------------------------------------------------------------ ancre

export interface KeynoteAnchor {
  at: Vec2;
  storyId: string;
}

/**
 * Où poser l'appel quand l'architecte l'attache à un ouvrage sélectionné.
 * Rend null pour un identifiant inconnu — le panneau retombe alors au centre.
 */
export function anchorOfEntity(project: Project, entityId: string): KeynoteAnchor | null {
  const wall = project.walls.find((w) => w.id === entityId);
  if (wall) return { at: wallMid(wall), storyId: wall.storyId };

  const opening = project.openings.find((o) => o.id === entityId);
  if (opening) {
    const host = project.walls.find((w) => w.id === opening.wallId);
    if (!host) return null;
    return { at: lerp(host.a, host.b, opening.t), storyId: host.storyId };
  }

  const room = project.rooms.find((r) => r.id === entityId);
  if (room) return { at: polygonCentroid(room.polygon), storyId: room.storyId };

  const slab = project.slabs.find((s) => s.id === entityId);
  if (slab) return { at: polygonCentroid(slab.polygon), storyId: slab.storyId };

  const roof = project.roofs.find((r) => r.id === entityId);
  if (roof) return { at: polygonCentroid(roof.polygon), storyId: roof.storyId };

  const column = project.columns.find((c) => c.id === entityId);
  if (column) return { at: column.position, storyId: column.storyId };

  const stair = project.stairs.find((s) => s.id === entityId);
  if (stair) return { at: stair.origin, storyId: stair.storyId };

  const furniture = project.furniture.find((f) => f.id === entityId);
  if (furniture) return { at: furniture.position, storyId: furniture.storyId };

  return null;
}

// -------------------------------------------------------------------- CSV

/** Base des repères en CSV, dans le format des nomenclatures (point-virgule). */
export function exportKeynotesCsv(project: Project): string {
  const legend = buildKeynoteLegend(project, null);
  const calls = new Map<string, number>();
  for (const g of legend.groups) {
    for (const e of g.entries) calls.set(e.keynote.id, e.count);
  }
  const notes = [...projectKeynotes(project)].sort(
    (a, b) => compareKeynoteCodes(a.code, b.code) || a.id.localeCompare(b.id),
  );
  const rows: string[][] = [
    ["Projet", project.name, "", "", ""],
    ["Nomenclature", "Repères", "", "", ""],
    ["Code", "Lot", "Désignation", "Spécification", "Appels"],
  ];
  for (const k of notes) {
    rows.push([k.code, lotLabel(k.lot), k.texte, k.detail ?? "", String(calls.get(k.id) ?? 0)]);
  }
  rows.push(["", "Total appels", "", "", String(legend.callCount)]);
  return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\n");
}
