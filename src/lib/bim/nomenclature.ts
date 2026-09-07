import { polygonArea, wallLength } from "./geometry";
import { computeQuantities, formatEuro, type BillOfQuantities } from "./quantities";
import {
  FURNITURE_LABELS,
  GLAZING_LABELS,
  MATERIAL_LABELS,
  ROLE_LABELS,
  ROOM_LABELS,
  type FurnitureKind,
  type Opening,
  type OpeningVariant,
  type Project,
  type Wall,
} from "./types";

export type NomKind = "postes" | "murs" | "portes" | "fenetres" | "pieces" | "objets" | "matieres";

export const NOM_TITLES: Record<NomKind, string> = {
  postes: "Postes",
  murs: "Murs",
  portes: "Portes",
  fenetres: "Fenêtres",
  pieces: "Pièces",
  objets: "Objets",
  matieres: "Matières",
};

export interface NomRow {
  id: string;
  mark: string;
  label: string;
  story: string;
  spec: string;
  qty: number;
  unit: string;
  unitPrice: number;
  total: number;
  entityIds: string[];
}

export interface Nomenclature {
  kind: NomKind;
  title: string;
  rows: NomRow[];
  totalQty: number;
  totalHT: number;
}

const VARIANT_FR: Record<OpeningVariant, string> = {
  single: "battante",
  double: "double",
  sliding: "coulissante",
  fixed: "fixe",
  casement: "à frappe",
  french: "porte-fenêtre",
};

const FURN_PRICE: Partial<Record<FurnitureKind, number>> = {
  sofa: 890,
  armchair: 420,
  chair: 95,
  table: 380,
  coffee: 220,
  bed: 720,
  kitchen: 2400,
  fridge: 890,
  stove: 540,
  bath: 680,
  toilet: 280,
  shower: 420,
  desk: 310,
  plant: 45,
  tree: 180,
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function dim(w: number, h: number): string {
  return `${w.toFixed(2).replace(".", ",")} × ${h.toFixed(2).replace(".", ",")} m`;
}

function storyOfWall(project: Project, wall: Wall): string {
  return project.stories.find((s) => s.id === wall.storyId)?.name ?? "—";
}

function storyOfOpening(project: Project, o: Opening): string {
  const wall = project.walls.find((w) => w.id === o.wallId);
  return wall ? storyOfWall(project, wall) : "—";
}

function storyName(project: Project, storyId: string): string {
  return project.stories.find((s) => s.id === storyId)?.name ?? "—";
}

function groupRows(
  kind: NomKind,
  items: { key: string; label: string; story: string; spec: string; qty: number; unit: string; unitPrice: number; entityId: string }[],
  prefix: string,
): NomRow[] {
  const map = new Map<string, NomRow>();
  for (const it of items) {
    const g = map.get(it.key);
    if (g) {
      g.qty = round2(g.qty + it.qty);
      g.total = Math.round(g.qty * g.unitPrice);
      g.entityIds.push(it.entityId);
      if (g.story !== it.story) g.story = "Plusieurs";
    } else {
      map.set(it.key, {
        id: it.key,
        mark: "",
        label: it.label,
        story: it.story,
        spec: it.spec,
        qty: round2(it.qty),
        unit: it.unit,
        unitPrice: it.unitPrice,
        total: Math.round(it.qty * it.unitPrice),
        entityIds: [it.entityId],
      });
    }
  }
  const rows = [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "fr"));
  rows.forEach((r, i) => {
    r.mark = `${prefix}-${String(i + 1).padStart(2, "0")}`;
  });
  void kind;
  return rows;
}

function wrap(kind: NomKind, rows: NomRow[]): Nomenclature {
  return {
    kind,
    title: NOM_TITLES[kind],
    rows,
    totalQty: round2(rows.reduce((s, r) => s + r.qty, 0)),
    totalHT: rows.reduce((s, r) => s + r.total, 0),
  };
}

function wallAreaNet(project: Project, w: Wall): number {
  const openings = project.openings
    .filter((o) => o.wallId === w.id)
    .reduce((s, o) => s + o.width * o.height, 0);
  return Math.max(0, wallLength(w) * w.height - openings);
}

export function buildNomenclature(project: Project, kind: NomKind, storyId?: string | null): Nomenclature {
  const onStory = (sid: string) => !storyId || sid === storyId;

  if (kind === "postes") {
    const bill: BillOfQuantities = computeQuantities(project);
    const rows: NomRow[] = bill.lines.map((l, i) => ({
      id: l.key,
      mark: `Q-${String(i + 1).padStart(2, "0")}`,
      label: l.label,
      story: "Ensemble",
      spec: `${l.qty.toLocaleString("fr-FR")} ${l.unit}`,
      qty: l.qty,
      unit: l.unit,
      unitPrice: l.unitPrice,
      total: l.total,
      entityIds: [],
    }));
    return wrap("postes", rows);
  }

  if (kind === "murs") {
    const items = project.walls.filter((w) => onStory(w.storyId)).map((w) => {
      const role = ROLE_LABELS[w.role ?? "interior"];
      const mat = MATERIAL_LABELS[w.materialId] ?? w.materialId;
      const ep = Math.round(w.thickness * 100);
      return {
        key: `${w.role ?? "int"}-${ep}-${w.materialId}`,
        label: `${role} ${ep} cm · ${mat}`,
        story: storyOfWall(project, w),
        spec: `L ${wallLength(w).toFixed(2).replace(".", ",")} m`,
        qty: round2(wallAreaNet(project, w)),
        unit: "m²",
        unitPrice: w.partition ? 85 : 165,
        entityId: w.id,
      };
    });
    return wrap("murs", groupRows("murs", items, "M"));
  }

  if (kind === "portes" || kind === "fenetres") {
    const want = kind === "portes" ? "door" : "window";
    const prefix = kind === "portes" ? "P" : "F";
    const items = project.openings
      .filter((o) => o.kind === want)
      .filter((o) => {
        const w = project.walls.find((x) => x.id === o.wallId);
        return w ? onStory(w.storyId) : !storyId;
      })
      .map((o) => {
        const variant = VARIANT_FR[o.variant ?? (o.kind === "door" ? "single" : "casement")];
        const glaze = o.kind === "window" ? GLAZING_LABELS[o.glazing ?? "double"] : "";
        const label =
          o.kind === "door"
            ? `Porte ${Math.round(o.width * 100)} ${variant}`
            : `Fenêtre ${Math.round(o.width * 100)} × ${Math.round(o.height * 100)} ${variant}`;
        return {
          key: `${o.kind}-${o.width}-${o.height}-${o.sill}-${o.variant ?? ""}-${o.glazing ?? ""}`,
          label: glaze ? `${label} · ${glaze}` : label,
          story: storyOfOpening(project, o),
          spec: o.kind === "window" ? `${dim(o.width, o.height)} · allège ${o.sill.toFixed(2).replace(".", ",")} m` : dim(o.width, o.height),
          qty: 1,
          unit: "u",
          unitPrice: o.kind === "door" ? (o.variant === "double" || o.variant === "sliding" ? 980 : 620) : Math.round(o.width * o.height * 380),
          entityId: o.id,
        };
      });
    return wrap(kind, groupRows(kind, items, prefix));
  }

  if (kind === "pieces") {
    const items = project.rooms.filter((r) => onStory(r.storyId)).map((r) => {
      const area = polygonArea(r.polygon);
      return {
        key: r.id,
        label: `${r.name} · ${ROOM_LABELS[r.function] ?? r.function}`,
        story: storyName(project, r.storyId),
        spec: `${area.toFixed(1).replace(".", ",")} m²`,
        qty: round2(area),
        unit: "m²",
        unitPrice: 0,
        entityId: r.id,
      };
    });
    const rows = items.map((it, i) => ({
      id: it.key,
      mark: `R-${String(i + 1).padStart(2, "0")}`,
      label: it.label,
      story: it.story,
      spec: it.spec,
      qty: it.qty,
      unit: it.unit,
      unitPrice: 0,
      total: 0,
      entityIds: [it.entityId],
    }));
    return wrap("pieces", rows);
  }

  if (kind === "objets") {
    const items = project.furniture.filter((f) => onStory(f.storyId)).map((f) => ({
      key: f.kind,
      label: FURNITURE_LABELS[f.kind] ?? f.kind,
      story: storyName(project, f.storyId),
      spec: dim(f.w, f.d),
      qty: 1,
      unit: "u",
      unitPrice: FURN_PRICE[f.kind] ?? 120,
      entityId: f.id,
    }));
    return wrap("objets", groupRows("objets", items, "O"));
  }

  // matières
  const matItems: { key: string; label: string; story: string; spec: string; qty: number; unit: string; unitPrice: number; entityId: string }[] = [];
  for (const w of project.walls.filter((w) => onStory(w.storyId))) {
    matItems.push({
      key: w.materialId,
      label: MATERIAL_LABELS[w.materialId] ?? w.materialId,
      story: storyOfWall(project, w),
      spec: "Élévation",
      qty: wallAreaNet(project, w),
      unit: "m²",
      unitPrice: 42,
      entityId: w.id,
    });
  }
  for (const s of project.slabs.filter((s) => onStory(s.storyId))) {
    matItems.push({
      key: s.materialId,
      label: MATERIAL_LABELS[s.materialId] ?? s.materialId,
      story: storyName(project, s.storyId),
      spec: "Dalle",
      qty: polygonArea(s.polygon),
      unit: "m²",
      unitPrice: 38,
      entityId: s.id,
    });
  }
  return wrap("matieres", groupRows("matieres", matItems, "MAT"));
}

export function buildAllNomenclatures(project: Project, storyId?: string | null): Nomenclature[] {
  return (["postes", "murs", "portes", "fenetres", "pieces", "objets", "matieres"] as NomKind[]).map((k) =>
    buildNomenclature(project, k, storyId),
  );
}

export function exportNomenclatureCsv(nom: Nomenclature, projectName: string): string {
  const rows = [
    ["Projet", projectName, "", "", "", "", "", ""],
    ["Nomenclature", nom.title, "", "", "", "", "", ""],
    ["Marque", "Désignation", "Niveau", "Cotes", "Qté", "Unité", "PU HT", "Total HT"],
  ];
  for (const r of nom.rows) {
    rows.push([
      r.mark,
      r.label,
      r.story,
      r.spec,
      String(r.qty).replace(".", ","),
      r.unit,
      String(r.unitPrice),
      String(r.total),
    ]);
  }
  rows.push(["", "Total HT", "", "", "", "", "", String(nom.totalHT)]);
  return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\n");
}

export function exportAllNomenclaturesCsv(project: Project): string {
  const parts = buildAllNomenclatures(project).map((n) => exportNomenclatureCsv(n, project.name));
  return parts.join("\n\n");
}

export { formatEuro };
