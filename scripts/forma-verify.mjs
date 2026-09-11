#!/usr/bin/env node
/**
 * Porte de qualité FORMA — `npm run verify`.
 *
 * Rassemble en une commande tout ce qui garde le produit : le typage, les
 * smokes métier (export CAD, relevé, PWA, cadastre, massing, étage type) et
 * les tests du domaine BIM.
 *
 * Pourquoi ce script existe : la CI ne lançait que `tsc`. Un lot de commits
 * « sauvegarde auto » a réécrit le manifeste PWA sur le gabarit générique —
 * l'application s'installait sous le nom « Grok App » en noir au lieu de
 * FORMA en #6ed0c3 — sans qu'aucune vérification ne s'en aperçoive.
 * `scripts/forma-pwa-check.mjs` l'aurait vu ; personne ne le lançait.
 *
 * Options : --rapide saute le typecheck (le plus lent), --json sort le
 * rapport machine.
 */
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, posix } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

/** Tous les `*.test.ts` de src, decouverts a chaque execution. */
function testsDuDomaine(base = "src") {
  const trouves = [];
  const parcourir = (rel) => {
    for (const e of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const sous = posix.join(rel, e.name);
      if (e.isDirectory()) parcourir(sous);
      else if (e.name.endsWith(".test.ts")) trouves.push(sous);
    }
  };
  parcourir(base);
  return trouves.sort();
}

/** Ce que FORMA possède et doit garder vert. Ordre : du plus structurant au plus fin. */
const ETAPES = [
  // Binaires appeles par leur chemin dans node_modules : `npx` est un .cmd sous
  // Windows, que Node 24 refuse de lancer sans shell (EINVAL), et `npx tsx`
  // telechargeait tsx a chaque execution — inutilisable en CI hors ligne.
  {
    id: "typecheck",
    titre: "Typage TypeScript",
    cmd: ["node", "node_modules/typescript/bin/tsc", "--noEmit"],
    lent: true,
  },
  {
    id: "domaine",
    titre: "Tests du domaine (src/**/*.test.ts)",
    // Decouverte, jamais une liste ecrite a la main : la version precedente
    // codait `src/lib/bim/bim.test.ts` en dur, si bien que les quatre fichiers
    // de tests ajoutes le 11/09 — decoupe de mur, toitures IFC, coherence du
    // metre, surete du store — ne tournaient dans AUCUNE porte. Trois
    // relecteurs l'ont releve separement. Un test qu'aucune porte ne lance ne
    // protege rien : c'est la lecon du manifeste PWA reste casse quatre jours.
    cmd: ["node", "node_modules/tsx/dist/cli.mjs", "--test", ...testsDuDomaine()],
  },
  { id: "cad-export", titre: "Export IFC / DXF", cmd: ["node", "scripts/cad-export-check.mjs"] },
  { id: "massa-az", titre: "Massing R+8 de bout en bout", cmd: ["node", "scripts/massa-az-check.mjs"] },
  { id: "typical", titre: "Étage type vivant", cmd: ["node", "scripts/typical-floor-check.mjs"] },
  { id: "survey-underlay", titre: "Relevé — calque photo", cmd: ["node", "scripts/survey-underlay-check.mjs"] },
  { id: "survey-walls", titre: "Relevé — murs extraits", cmd: ["node", "scripts/survey-to-walls-check.mjs"] },
  { id: "pwa", titre: "PWA — identité et coque hors ligne", cmd: ["node", "scripts/forma-pwa-check.mjs"] },
  {
    id: "cadastre",
    titre: "Cadastre BAN / IGN",
    cmd: ["node", "scripts/cadastre-smoke.mjs"],
    // Interroge api-adresse.data.gouv.fr et apicarto.ign.fr. Une coupure chez
    // eux n'est pas une regression FORMA : elle est signalee, pas comptee rouge.
    reseau: true,
  },
  { id: "brand", titre: "Marque", cmd: ["node", "scripts/brand-check.mjs"] },
];

const PANNE_RESEAU =
  /ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ECONNREFUSED|fetch failed|socket hang up|502|503|504/i;

const args = new Set(process.argv.slice(2));
const rapide = args.has("--rapide") || args.has("--fast");
const enJson = args.has("--json");

function lancer(cmd) {
  return new Promise((resolve) => {
    const [exe, ...reste] = cmd;
    const child = spawn(exe, reste, {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("error", (e) => resolve({ code: 1, out: String(e.message) }));
    child.on("close", (code) => resolve({ code: code ?? 1, out }));
  });
}

/** Dernière ligne utile d'une sortie, pour un rapport tenant sur un écran. */
function resume(out, code) {
  const lignes = out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lignes.length === 0) return code === 0 ? "ok" : "aucune sortie";
  if (code === 0) return lignes[lignes.length - 1].slice(0, 160);
  const parlante =
    lignes.find((l) => /error|Error|assert|✖|failed|ECHEC/i.test(l)) ?? lignes[lignes.length - 1];
  return parlante.slice(0, 200);
}

const debut = Date.now();
const resultats = [];

for (const etape of ETAPES) {
  if (rapide && etape.lent) {
    resultats.push({ ...etape, statut: "saute", detail: "--rapide" });
    if (!enJson) console.log(`  ·  ${etape.titre} — sauté`);
    continue;
  }
  const t0 = Date.now();
  const { code, out } = await lancer(etape.cmd);
  const ms = Date.now() - t0;
  const ok = code === 0;
  const coupure = !ok && etape.reseau === true && PANNE_RESEAU.test(out);
  const statut = ok ? "ok" : coupure ? "reseau" : "echec";
  resultats.push({
    id: etape.id,
    titre: etape.titre,
    statut,
    ms,
    detail: resume(out, code),
    ...(statut === "echec" ? { sortie: out.slice(-4000) } : {}),
  });
  if (!enJson) {
    const marque = statut === "ok" ? "OK  " : statut === "reseau" ? "RES." : "ECHEC";
    console.log(`  ${marque} ${etape.titre} (${(ms / 1000).toFixed(1)} s)`);
    if (statut === "reseau") console.log("       service tiers injoignable, verification non concluante");
    else if (!ok) console.log(`       ${resume(out, code)}`);
  }
}

const echecs = resultats.filter((r) => r.statut === "echec");
const total = ((Date.now() - debut) / 1000).toFixed(1);

if (enJson) {
  console.log(JSON.stringify({ ok: echecs.length === 0, secondes: Number(total), resultats }, null, 2));
} else {
  console.log("");
  if (echecs.length === 0) {
    console.log(`FORMA vert — ${resultats.filter((r) => r.statut === "ok").length} verifications en ${total} s`);
  } else {
    console.log(`FORMA rouge — ${echecs.length} verification(s) en echec sur ${resultats.length} :`);
    for (const e of echecs) {
      console.log("");
      console.log(`--- ${e.titre} ---`);
      console.log(e.sortie?.trim() || e.detail);
    }
  }
}

process.exit(echecs.length === 0 ? 0 : 1);
