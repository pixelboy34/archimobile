import { analyzeProject } from "./analysis";
import { assessFeasibility, VERDICT_LABELS } from "./feasibility";
import { CADASTRE_DISCLAIMER, formatCadastralRef } from "@/lib/geo/cadastre";
import {
  aboveGroundHeight,
  buildCoupeSvg,
  buildFacadeSvg,
  buildPlanSvg,
  pickFacades,
  storyRoleLabel,
} from "./planSvg";
import {
  computeQuantities,
  downloadText,
  exportBimJson,
  exportQuantitiesCsv,
  formatEuro,
} from "./quantities";
import { buildNomenclature, type NomKind } from "./nomenclature";
import { exportDxf } from "../cad/dxf";
import { exportIfc } from "../cad/ifc";
import { TYPOLOGY_LABELS, type Project, type Typology } from "./types";

const ACCENT = "#6ed0c3";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function typologyLabel(t?: Typology): string {
  if (!t) return "Non renseignée";
  return TYPOLOGY_LABELS[t] ?? t;
}

function dateFr(d = new Date()): string {
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function slug(name: string): string {
  return name.replace(/\s+/g, "-").toLowerCase().replace(/[^a-z0-9àâäéèêëïîôùûüç._-]/gi, "");
}

export interface DossierResult {
  planCount: number;
  html: string;
}

/** Build the full printable HTML dossier (no side effects). */
export function buildDossierHtml(project: Project): DossierResult {
  const analysis = analyzeProject(project);
  const feas = assessFeasibility(project, null, analysis);
  const bill = computeQuantities(project);
  const stories = [...project.stories].sort((a, b) => a.elevation - b.elevation);
  const planSvgs = stories.map((st) => buildPlanSvg(project, st));
  const coupe = buildCoupeSvg(project);
  const [f1, f2] = pickFacades(project);
  const facade1 = buildFacadeSvg(project, f1);
  const facade2 = buildFacadeSvg(project, f2);
  const hAg = aboveGroundHeight(project);
  const cesCap = project.meta.ces ?? 0;
  const cosCap = project.meta.cos ?? 0;
  const cesOk = feas.gauges.ces.ok;
  const cosOk = feas.gauges.cos.ok;
  const verdictClass = feas.verdict === "ok" ? "ok" : feas.verdict === "fail" ? "bad" : "";
  const verdictLabel = VERDICT_LABELS[feas.verdict];

  const roomRows = analysis.rooms
    .map(
      (r) =>
        `<tr><td>${esc(r.name)}</td><td>${esc(r.story)}</td><td class="num">${r.area.toFixed(1)}</td></tr>`,
    )
    .join("");

  const metreRows = bill.lines
    .map(
      (l) =>
        `<tr><td>${esc(l.label)}</td><td class="num">${l.qty.toLocaleString("fr-FR")}</td><td>${esc(l.unit)}</td><td class="num">${l.unitPrice.toLocaleString("fr-FR")}</td><td class="num">${l.total.toLocaleString("fr-FR")}</td></tr>`,
    )
    .join("");

  const nomKinds: NomKind[] = ["portes", "fenetres", "objets", "murs"];
  const nomHtml = nomKinds
    .map((k) => {
      const n = buildNomenclature(project, k);
      if (!n.rows.length) return "";
      const rows = n.rows
        .map(
          (r) =>
            `<tr><td>${esc(r.mark)}</td><td>${esc(r.label)}</td><td>${esc(r.story)}</td><td>${esc(r.spec)}</td><td class="num">${r.qty.toLocaleString("fr-FR")} ${esc(r.unit)}</td><td class="num">${r.total.toLocaleString("fr-FR")}</td></tr>`,
        )
        .join("");
      return `<h2 style="margin-top:28px">Nomenclature — ${esc(n.title)}</h2>
  <table>
    <thead><tr><th>Marque</th><th>Désignation</th><th>Niveau</th><th>Cotes</th><th class="num">Qté</th><th class="num">HT</th></tr></thead>
    <tbody>${rows}<tr class="total"><td></td><td>Total</td><td></td><td></td><td></td><td class="num">${n.totalHT.toLocaleString("fr-FR")} EUR</td></tr></tbody>
  </table>`;
    })
    .join("");

  const niveauList = stories
    .map((st, i) => {
      const role = storyRoleLabel(st, project.stories.indexOf(st), project.stories);
      return `<li><strong>${esc(role)}</strong> — ${esc(st.name || role)} · +${st.elevation.toFixed(2)} m · HSP ${st.height.toFixed(2)} m</li>`;
    })
    .join("");

  const planSections = planSvgs
    .map(
      (svg, i) =>
        `<section class="page plan"><h2>Plan — ${esc(storyRoleLabel(stories[i]!, project.stories.indexOf(stories[i]!), project.stories))}</h2><div class="fig">${svg}</div></section>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<title>Dossier — ${esc(project.name)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm 16mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: #1a1916;
    background: #fff;
    font-family: "Outfit", "Segoe UI", system-ui, -apple-system, sans-serif;
    font-size: 11pt;
    line-height: 1.45;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  h1, h2, h3 {
    font-family: "Syne", "Segoe UI", system-ui, sans-serif;
    font-weight: 700;
    letter-spacing: -0.01em;
    margin: 0 0 0.4em;
  }
  h1 { font-size: 28pt; line-height: 1.1; }
  h2 {
    font-size: 11pt;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #5c5a54;
    border-bottom: 2px solid ${ACCENT};
    padding-bottom: 6px;
    margin: 0 0 14px;
  }
  .meta { color: #5c5a54; font-size: 10pt; }
  .accent { color: ${ACCENT}; }
  .num { font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; text-align: right; }
  .page { page-break-after: always; break-after: page; padding-bottom: 8mm; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .cover {
    min-height: 240mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .cover-top { border-top: 4px solid ${ACCENT}; padding-top: 18px; }
  .brand {
    font-size: 9pt;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: ${ACCENT};
    font-weight: 700;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px 24px;
    margin-top: 28px;
  }
  .kpi {
    border: 1px solid #ddd8cc;
    padding: 10px 12px;
  }
  .kpi .l { font-size: 8pt; letter-spacing: 0.12em; text-transform: uppercase; color: #5c5a54; }
  .kpi .v { font-size: 16pt; font-weight: 700; margin-top: 2px; font-variant-numeric: tabular-nums; }
  .ok { color: #1a7a66; }
  .bad { color: #a33; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  th, td { border-bottom: 1px solid #ddd8cc; padding: 7px 4px; text-align: left; vertical-align: top; }
  th { font-size: 8pt; letter-spacing: 0.1em; text-transform: uppercase; color: #5c5a54; font-weight: 600; }
  td.num, th.num { text-align: right; }
  tr.total td { font-weight: 700; font-size: 12pt; border-bottom: none; padding-top: 12px; }
  .fig { margin: 8px 0; }
  .fig svg { max-width: 100%; height: auto; display: block; }
  .kpis-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin: 12px 0 18px;
  }
  ul.niveaux { margin: 8px 0 0; padding-left: 1.1em; }
  ul.niveaux li { margin: 3px 0; }
  footer.site {
    margin-top: 18px;
    padding-top: 10px;
    border-top: 1px solid #ddd8cc;
    font-size: 8.5pt;
    color: #5c5a54;
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  footer.site .mark { color: ${ACCENT}; font-weight: 700; letter-spacing: 0.16em; }
  @media print {
    body { margin: 0; }
    .page { page-break-after: always; }
  }
</style>
</head>
<body>

<section class="page cover">
  <div class="cover-top">
    <p class="brand">FORMA · Dossier architectural</p>
    <h1 style="margin-top:18px">${esc(project.name)}</h1>
    <p class="meta" style="margin-top:8px;font-size:12pt">
      ${esc(project.meta.parcelle?.address || project.meta.location || "Lieu non renseigné")}
      · ${esc(project.meta.client || "Maître d'ouvrage non renseigné")}
    </p>
    ${project.meta.parcelle ? `<p class="meta" style="margin-top:4px">Site · ${esc(formatCadastralRef(project.meta.parcelle))} · ${Math.round(project.meta.parcelle.areaM2).toLocaleString("fr-FR")} m²<br/><span style="opacity:0.75;font-size:9pt">${esc(CADASTRE_DISCLAIMER)}</span></p>` : ""}
    <p class="meta">${esc(typologyLabel(project.meta.typology))} · ${esc(dateFr())}</p>
    <p class="meta" style="margin-top:10px">
      Faisabilité · <strong class="${verdictClass}">${esc(verdictLabel)}</strong>
      · score ${feas.score}/100
      · CES ${(analysis.cesActual * 100).toFixed(0)} %${cesCap > 0 ? ` / ${(cesCap * 100).toFixed(0)} %` : ""}
      · COS ${analysis.cosActual.toFixed(2)}${cosCap > 0 ? ` / ${cosCap.toFixed(2)}` : ""}
      <span style="opacity:0.7"> · indicatif</span>
    </p>
    ${project.meta.brief ? `<p style="margin-top:16px;max-width:36em">${esc(project.meta.brief)}</p>` : ""}
    <div class="grid">
      <div class="kpi"><div class="l">Niveaux</div><div class="v">${stories.length}</div></div>
      <div class="kpi"><div class="l">Hauteur hors sol</div><div class="v">${hAg.toFixed(2)} m</div></div>
      <div class="kpi"><div class="l">SDP (approx.)</div><div class="v">${Math.round(analysis.floorArea).toLocaleString("fr-FR")} m²</div></div>
      <div class="kpi"><div class="l">Emprise</div><div class="v">${Math.round(analysis.footprint).toLocaleString("fr-FR")} m²</div></div>
      <div class="kpi"><div class="l">CES</div><div class="v ${cesOk ? "ok" : "bad"}">${(analysis.cesActual * 100).toFixed(0)} %${cesCap > 0 ? ` / ${(cesCap * 100).toFixed(0)} %` : ""}</div></div>
      <div class="kpi"><div class="l">COS</div><div class="v ${cosOk ? "ok" : "bad"}">${analysis.cosActual.toFixed(2)}${cosCap > 0 ? ` / ${cosCap.toFixed(2)}` : ""}</div></div>
      <div class="kpi"><div class="l">Total HT</div><div class="v accent">${esc(formatEuro(bill.totalHT))}</div></div>
      <div class="kpi"><div class="l">Parcelle</div><div class="v">${project.meta.plotM2 ? `${Math.round(project.meta.plotM2).toLocaleString("fr-FR")} m²` : "—"}</div></div>
    </div>
    <h3 style="margin-top:28px;font-size:10pt;letter-spacing:0.12em;text-transform:uppercase;color:#5c5a54">Composition</h3>
    <ul class="niveaux">${niveauList}</ul>
  </div>
  <footer class="site">
    <span><span class="mark">FORMA</span> — livrable indicatif, hors honoraires et aléas</span>
    <span class="num">${esc(dateFr())}</span>
  </footer>
</section>

${planSections}

<section class="page">
  <h2>Coupe schématique</h2>
  <div class="fig">${coupe}</div>
  <footer class="site">
    <span><span class="mark">FORMA</span> · coupe de masse</span>
    <span>${esc(project.name)}</span>
  </footer>
</section>

<section class="page">
  <h2>Façades</h2>
  <div class="fig">${facade1}</div>
  <div class="fig" style="margin-top:16px">${facade2}</div>
  <footer class="site">
    <span><span class="mark">FORMA</span> · élévations</span>
    <span>${esc(project.name)}</span>
  </footer>
</section>

<section class="page">
  <h2>Métré estimatif HT</h2>
  <div class="kpis-row">
    <div class="kpi"><div class="l">Murs</div><div class="v">${bill.wallM2.toFixed(0)} m²</div></div>
    <div class="kpi"><div class="l">Dalles</div><div class="v">${bill.slabM2.toFixed(0)} m²</div></div>
    <div class="kpi"><div class="l">Verre</div><div class="v">${bill.glassM2.toFixed(1)} m²</div></div>
    <div class="kpi"><div class="l">Béton</div><div class="v">${bill.concreteM3.toFixed(1)} m³</div></div>
  </div>
  <table>
    <thead><tr><th>Poste</th><th class="num">Qté</th><th>Unité</th><th class="num">PU</th><th class="num">Total HT</th></tr></thead>
    <tbody>
      ${metreRows}
      <tr class="total"><td>Total HT</td><td></td><td></td><td></td><td class="num">${bill.totalHT.toLocaleString("fr-FR")} EUR</td></tr>
    </tbody>
  </table>
  ${nomHtml}
  ${
    analysis.rooms.length
      ? `<h2 style="margin-top:28px">Pièces</h2>
  <table>
    <thead><tr><th>Pièce</th><th>Niveau</th><th class="num">m²</th></tr></thead>
    <tbody>${roomRows}</tbody>
  </table>`
      : ""
  }
  ${
    analysis.notes.length
      ? `<h2 style="margin-top:28px">Notes</h2><ul>${analysis.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`
      : ""
  }
  <footer class="site">
    <span><span class="mark">FORMA</span> — estimation indicative · accent ${ACCENT}</span>
    <span class="num">${esc(formatEuro(bill.totalHT))}</span>
  </footer>
</section>

</body>
</html>`;

  return { planCount: planSvgs.length, html };
}

export interface DeliverOptions {
  /** Also download .forma.json (default true). */
  includeJson?: boolean;
  /** Open print dialog (default true). */
  print?: boolean;
}

/**
 * One-tap dossier: print window + IFC / DXF / CSV (+ optional JSON) downloads.
 * Fully client-side / offline.
 */
export function deliverDossier(project: Project, opts: DeliverOptions = {}): DossierResult {
  const includeJson = opts.includeJson !== false;
  const doPrint = opts.print !== false;
  const base = slug(project.name) || "projet-forma";
  const result = buildDossierHtml(project);

  downloadText(`${base}.ifc`, exportIfc(project), "application/x-step");
  downloadText(`${base}.dxf`, exportDxf(project), "application/dxf");
  downloadText(`${base}-metre.csv`, exportQuantitiesCsv(project), "text/csv");
  if (includeJson) {
    downloadText(`${base}.forma.json`, exportBimJson(project));
  }

  if (doPrint && typeof window !== "undefined") {
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (w) {
      w.document.write(result.html);
      w.document.close();
      w.focus();
      // Allow layout before print
      setTimeout(() => {
        try {
          w.print();
        } catch {
          /* ignore */
        }
      }, 250);
    }
  }

  return result;
}
