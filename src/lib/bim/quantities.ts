import { polygonArea, wallLength } from "./geometry";
import { analyzeProject } from "./analysis";
import type { Project } from "./types";

export interface QtyLine {
  key: string;
  label: string;
  qty: number;
  unit: string;
  unitPrice: number;
  total: number;
}

export interface BillOfQuantities {
  lines: QtyLine[];
  totalHT: number;
  wallM2: number;
  slabM2: number;
  roofM2: number;
  glassM2: number;
  concreteM3: number;
}

function line(key: string, label: string, qty: number, unit: string, unitPrice: number): QtyLine {
  const q = Math.round(qty * 100) / 100;
  return { key, label, qty: q, unit, unitPrice, total: Math.round(q * unitPrice) };
}

export function computeQuantities(project: Project): BillOfQuantities {
  let wallM2 = 0;
  for (const w of project.walls) {
    const openings = project.openings
      .filter((o) => o.wallId === w.id)
      .reduce((s, o) => s + o.width * o.height, 0);
    wallM2 += Math.max(0, wallLength(w) * w.height - openings);
  }
  let slabM2 = 0;
  let slabM3 = 0;
  for (const s of project.slabs) {
    const a = polygonArea(s.polygon);
    slabM2 += a;
    slabM3 += a * s.thickness;
  }
  let roofM2 = 0;
  for (const r of project.roofs) roofM2 += polygonArea(r.polygon) * (r.kind === "gable" ? 1.18 : 1);
  let glassM2 = 0;
  let doors = 0;
  for (const o of project.openings) {
    if (o.kind === "window") glassM2 += o.width * o.height;
    else doors += 1;
  }
  const columns = project.columns.length;
  const stairs = project.stairs.length;
  const colMl = project.columns.reduce((s, c) => s + c.height, 0);

  const lines = [
    line("walls", "Murs (élévation)", wallM2, "m²", 165),
    line("slab", "Dalles béton", slabM2, "m²", 95),
    line("conc", "Béton coffré", slabM3 + colMl * 0.09, "m³", 220),
    line("col", "Poteaux", columns, "u", 420),
    line("roof", "Toiture", roofM2, "m²", 110),
    line("win", "Vitrages", glassM2, "m²", 380),
    line("door", "Portes", doors, "u", 620),
    line("stair", "Escaliers", stairs, "u", 2800),
  ].filter((l) => l.qty > 0.05);

  const totalHT = lines.reduce((s, l) => s + l.total, 0);
  return {
    lines,
    totalHT,
    wallM2,
    slabM2,
    roofM2,
    glassM2,
    concreteM3: slabM3 + colMl * 0.09,
  };
}

export function formatEuro(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function exportBimJson(project: Project): string {
  return JSON.stringify(
    {
      format: "forma-bim-1",
      exportedAt: new Date().toISOString(),
      project,
      quantities: computeQuantities(project),
    },
    null,
    2,
  );
}

export function downloadText(filename: string, text: string, mime = "application/json") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseImportedProject(raw: string): unknown {
  const data = JSON.parse(raw) as { format?: string; project?: unknown };
  if (data && typeof data === "object" && data.project) return data.project;
  return JSON.parse(raw);
}

export function exportQuantitiesCsv(project: Project): string {
  const bill = computeQuantities(project);
  const rows = [["Poste", "Quantité", "Unité", "Prix unitaire", "Total HT"]];
  for (const l of bill.lines) {
    rows.push([l.label, String(l.qty).replace(".", ","), l.unit, String(l.unitPrice), String(l.total)]);
  }
  rows.push(["Total HT", "", "", "", String(bill.totalHT)]);
  return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\n");
}

export function printDossier(project: Project) {
  void import("./dossier").then(({ deliverDossier }) => deliverDossier(project));
}

export async function shareProject(project: Project) {
  const name = `${project.name.replace(/\s+/g, "-").toLowerCase()}.forma.json`;
  const payload = exportBimJson(project);
  const file = new File([payload], name, { type: "application/json" });
  const nav = navigator as Navigator & {
    canShare?: (d: ShareData) => boolean;
  };
  try {
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ title: project.name, text: project.meta.location, files: [file] });
      return;
    }
    if (nav.share) {
      await nav.share({
        title: project.name,
        text: `${project.name} — ${project.meta.location}\n${formatEuro(computeQuantities(project).totalHT)} HT`,
      });
      return;
    }
  } catch {
    return;
  }
  downloadText(name, payload);
}
