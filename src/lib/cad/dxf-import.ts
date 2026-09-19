import type { Vec2 } from "@/lib/bim/types";

/**
 * Lecture d'un DXF ASCII — le fond de plan du géomètre.
 *
 * FORMA savait écrire du DXF sans savoir en lire : un architecte ne pouvait
 * faire entrer un plan existant qu'en photographiant un tirage papier, par le
 * flux Relevé. Ce module lit ce que le géomètre envoie réellement.
 *
 * Tout est pur : une chaîne entre, des données sortent. Aucun accès au DOM,
 * aucune horloge, aucun aléatoire — le domaine doit rester rejouable.
 *
 * Le parti pris de fond : un fichier réel est rarement propre. On ne lève
 * jamais sur une entrée malformée ; on rend ce qu'on a pu lire et la liste de
 * ce qu'on n'a pas compris. Un import qui perd des choses doit le dire.
 */

/** Unités DXF ($INSUNITS), en mètres. */
const FACTEURS: Record<number, number> = {
  1: 0.0254, // pouce
  2: 0.3048, // pied
  3: 1609.344, // mille
  4: 0.001, // millimètre
  5: 0.01, // centimètre
  6: 1, // mètre
  7: 1000, // kilomètre
  8: 2.54e-8, // micropouce
  9: 2.54e-5, // mil
  10: 0.9144, // yard
};

const NOMS_UNITE: Record<number, string> = {
  0: "sans unité",
  1: "pouces",
  2: "pieds",
  3: "milles",
  4: "millimètres",
  5: "centimètres",
  6: "mètres",
  7: "kilomètres",
  8: "micropouces",
  9: "mils",
  10: "yards",
};

/** Unités plausibles pour un plan de bâtiment, quand l'en-tête est muet. */
const CANDIDATS: { code: number; facteur: number }[] = [
  { code: 6, facteur: 1 },
  { code: 5, facteur: 0.01 },
  { code: 4, facteur: 0.001 },
  { code: 2, facteur: 0.3048 },
  { code: 1, facteur: 0.0254 },
];

/** Étendue visée pour un plan d'architecte, en mètres : de la pièce à l'îlot. */
const ETENDUE_IDEALE = 25;

export interface DxfPolyline {
  /** Sommets en MÈTRES, dans le repère du fichier. */
  points: Vec2[];
  /** Calque d'origine, tel qu'écrit dans le fichier. */
  layer: string;
  closed: boolean;
  /** Entité dont elle provient : utile pour expliquer ce qui a été lu. */
  source: "LINE" | "LWPOLYLINE" | "POLYLINE" | "ARC" | "CIRCLE";
}

export interface DxfLayerInfo {
  name: string;
  /** Nombre de polylignes retenues sur ce calque. */
  count: number;
}

export interface DxfUnit {
  /** Code $INSUNITS retenu. */
  code: number;
  /** Facteur appliqué pour passer en mètres. */
  factor: number;
  label: string;
  /**
   * Vrai quand l'en-tête était absente, nulle ou invraisemblable et que
   * l'unité a été déduite de l'ordre de grandeur du dessin. L'appelant DOIT
   * le dire à l'utilisateur : deviner en silence est ce qui fait entrer un
   * plan à l'échelle 1000.
   */
  inferred: boolean;
  /** Ce que l'en-tête déclarait, quand elle déclarait quelque chose. */
  declared?: number;
}

export interface DxfImport {
  polylines: DxfPolyline[];
  layers: DxfLayerInfo[];
  unit: DxfUnit;
  /** Étendue en mètres, après conversion. Nulle si rien n'a été lu. */
  extent: { min: Vec2; max: Vec2; width: number; height: number } | null;
  /** Types d'entités rencontrés mais non lus, avec leur nombre. */
  ignored: { type: string; count: number }[];
  /** Anomalies rencontrées, en français, à montrer telles quelles. */
  warnings: string[];
}

export interface DxfImportOptions {
  /**
   * Flèche maximale tolérée en discrétisant un arc, en mètres. Un nombre de
   * segments fixe traiterait de la même façon un cercle de 30 m et un cercle
   * de 30 cm ; la flèche, elle, tient la précision quelle que soit la taille.
   */
  sagitta?: number;
  /** Unité imposée par l'appelant, qui court-circuite en-tête et déduction. */
  forceUnit?: number;
}

/** Une paire (code de groupe, valeur) du fichier. */
interface Pair {
  code: number;
  value: string;
}

/**
 * Découpe le fichier en paires. Tolère CRLF comme LF, les espaces autour du
 * code, une dernière paire tronquée, et les lignes de code illisibles — qui
 * sont comptées plutôt que fatales.
 */
function tokenize(raw: string): { pairs: Pair[]; badCodes: number } {
  const lines = raw.split(/\r\n|\r|\n/);
  const pairs: Pair[] = [];
  let badCodes = 0;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const codeTxt = (lines[i] ?? "").trim();
    if (codeTxt === "") continue;
    const code = Number(codeTxt);
    if (!Number.isInteger(code)) {
      badCodes++;
      continue;
    }
    pairs.push({ code, value: (lines[i + 1] ?? "").trim() });
  }
  return { pairs, badCodes };
}

function num(v: string | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Lit $INSUNITS dans la section HEADER. */
function readInsunits(pairs: Pair[]): number | null {
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i]!;
    if (p.code !== 9 || p.value !== "$INSUNITS") continue;
    for (let j = i + 1; j < Math.min(pairs.length, i + 6); j++) {
      const q = pairs[j]!;
      if (q.code === 70) return num(q.value);
      if (q.code === 9 || q.code === 0) break;
    }
  }
  return null;
}

/**
 * Déduit l'unité de l'ordre de grandeur du dessin.
 *
 * Un plan de maison fait 10 à 30 m : une étendue brute de 20 000 signale des
 * millimètres, pas des mètres. On retient le facteur qui rapproche le plus
 * l'étendue d'une taille de bâtiment plausible, à égalité près où le métrique
 * l'emporte — l'ordre de CANDIDATS le garantit.
 */
function inferUnit(spanBrut: number): { code: number; factor: number } {
  if (!(spanBrut > 0) || !Number.isFinite(spanBrut)) return { code: 6, factor: 1 };
  let best = CANDIDATS[0]!;
  let bestEcart = Infinity;
  for (const c of CANDIDATS) {
    const ecart = Math.abs(Math.log(spanBrut * c.facteur) - Math.log(ETENDUE_IDEALE));
    if (ecart < bestEcart - 1e-9) {
      bestEcart = ecart;
      best = c;
    }
  }
  return { code: best.code, factor: best.facteur };
}

/**
 * Discrétise un arc avec une flèche bornée.
 *
 * Le pas angulaire découle du rayon : 2·acos(1 − f/r). Un grand cercle reçoit
 * donc plus de segments qu'un petit, à précision égale — ce qu'un nombre de
 * segments fixe ne sait pas faire.
 */
function arcPoints(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
  sagitta: number,
): Vec2[] {
  if (!(r > 0)) return [];
  let sweep = endDeg - startDeg;
  // Le DXF écrit les angles en sens trigonométrique ; une fin inférieure au
  // début signifie que l'arc franchit l'origine des angles.
  while (sweep <= 0) sweep += 360;
  while (sweep > 360) sweep -= 360;

  const ratio = Math.min(1, Math.max(0, sagitta / r));
  const pasMax = 2 * Math.acos(1 - ratio);
  const pas = pasMax > 1e-6 ? pasMax : Math.PI / 90;
  const n = Math.min(720, Math.max(4, Math.ceil(((sweep * Math.PI) / 180) / pas)));

  const pts: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((startDeg + (sweep * i) / n) * Math.PI) / 180;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

/** Entité brute, avant conversion d'unité. */
interface RawEntity {
  type: string;
  layer: string;
  pairs: Pair[];
}

function splitEntities(pairs: Pair[]): { entities: RawEntity[]; inEntities: boolean } {
  const entities: RawEntity[] = [];
  let section = "";
  let current: RawEntity | null = null;
  let sawEntities = false;

  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i]!;
    if (p.code === 0) {
      if (p.value === "SECTION") {
        const next = pairs[i + 1];
        section = next && next.code === 2 ? next.value : "";
        if (section === "ENTITIES") sawEntities = true;
        current = null;
        continue;
      }
      if (p.value === "ENDSEC" || p.value === "EOF") {
        section = "";
        current = null;
        continue;
      }
      if (section !== "ENTITIES") {
        current = null;
        continue;
      }
      current = { type: p.value, layer: "0", pairs: [] };
      entities.push(current);
      continue;
    }
    if (!current) continue;
    if (p.code === 8) current.layer = p.value || "0";
    current.pairs.push(p);
  }
  return { entities, inEntities: sawEntities };
}

/** Sommets d'une LWPOLYLINE : les 10 et 20 s'apparient dans l'ordre d'écriture. */
function lwVertices(e: RawEntity): Vec2[] {
  const pts: Vec2[] = [];
  let x: number | null = null;
  for (const p of e.pairs) {
    if (p.code === 10) {
      // Un 10 sans son 20 : sommet incomplet, on repart du suivant.
      x = num(p.value);
    } else if (p.code === 20 && x != null) {
      const y = num(p.value);
      if (y != null) pts.push({ x, y });
      x = null;
    }
  }
  return pts;
}

/**
 * Lit un DXF ASCII et rend des polylignes en mètres.
 *
 * Ne lève jamais : un fichier illisible rend un résultat vide assorti d'un
 * avertissement, ce que l'interface peut montrer.
 */
export function importDxf(raw: string, opts: DxfImportOptions = {}): DxfImport {
  const vide: DxfImport = {
    polylines: [],
    layers: [],
    unit: { code: 6, factor: 1, label: NOMS_UNITE[6]!, inferred: true },
    extent: null,
    ignored: [],
    warnings: [],
  };
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ...vide, warnings: ["Fichier vide."] };
  }

  const warnings: string[] = [];
  const { pairs, badCodes } = tokenize(raw);
  if (badCodes > 0) {
    warnings.push(`${badCodes} code${badCodes > 1 ? "s" : ""} de groupe illisible${badCodes > 1 ? "s" : ""}, ignoré${badCodes > 1 ? "s" : ""}.`);
  }
  if (pairs.length === 0) return { ...vide, warnings: [...warnings, "Aucune paire code/valeur lisible : ce fichier n'est pas un DXF ASCII."] };

  const declared = readInsunits(pairs);
  const { entities, inEntities } = splitEntities(pairs);
  if (!inEntities) warnings.push("Aucune section ENTITIES : le fichier est peut-être tronqué.");

  // Première passe en unités brutes : l'étendue sert à déduire l'unité quand
  // l'en-tête est muette, il faut donc l'avoir avant de convertir.
  const sagittaBrut = opts.sagitta ?? 0.01;
  const brutes: { pts: Vec2[]; layer: string; closed: boolean; source: DxfPolyline["source"] }[] = [];
  const ignoredMap = new Map<string, number>();
  let arcsEnAttente: { e: RawEntity; cx: number; cy: number; r: number; a0: number; a1: number }[] = [];

  let polylineOuverte: { layer: string; closed: boolean; pts: Vec2[] } | null = null;

  for (const e of entities) {
    switch (e.type) {
      case "LINE": {
        const g: Record<number, number | null> = {};
        for (const p of e.pairs) if ([10, 20, 11, 21].includes(p.code)) g[p.code] = num(p.value);
        if (g[10] != null && g[20] != null && g[11] != null && g[21] != null) {
          brutes.push({
            pts: [
              { x: g[10]!, y: g[20]! },
              { x: g[11]!, y: g[21]! },
            ],
            layer: e.layer,
            closed: false,
            source: "LINE",
          });
        } else {
          ignoredMap.set("LINE (incomplète)", (ignoredMap.get("LINE (incomplète)") ?? 0) + 1);
        }
        break;
      }
      case "LWPOLYLINE": {
        const pts = lwVertices(e);
        const flag = e.pairs.find((p) => p.code === 70);
        const closed = ((num(flag?.value) ?? 0) & 1) === 1;
        if (pts.length >= 2) brutes.push({ pts, layer: e.layer, closed, source: "LWPOLYLINE" });
        else ignoredMap.set("LWPOLYLINE (moins de 2 sommets)", (ignoredMap.get("LWPOLYLINE (moins de 2 sommets)") ?? 0) + 1);
        break;
      }
      case "POLYLINE": {
        const flag = e.pairs.find((p) => p.code === 70);
        polylineOuverte = { layer: e.layer, closed: ((num(flag?.value) ?? 0) & 1) === 1, pts: [] };
        break;
      }
      case "VERTEX": {
        if (!polylineOuverte) break;
        const x = num(e.pairs.find((p) => p.code === 10)?.value);
        const y = num(e.pairs.find((p) => p.code === 20)?.value);
        if (x != null && y != null) polylineOuverte.pts.push({ x, y });
        break;
      }
      case "SEQEND": {
        if (polylineOuverte && polylineOuverte.pts.length >= 2) {
          brutes.push({
            pts: polylineOuverte.pts,
            layer: polylineOuverte.layer,
            closed: polylineOuverte.closed,
            source: "POLYLINE",
          });
        }
        polylineOuverte = null;
        break;
      }
      case "ARC": {
        const cx = num(e.pairs.find((p) => p.code === 10)?.value);
        const cy = num(e.pairs.find((p) => p.code === 20)?.value);
        const r = num(e.pairs.find((p) => p.code === 40)?.value);
        const a0 = num(e.pairs.find((p) => p.code === 50)?.value);
        const a1 = num(e.pairs.find((p) => p.code === 51)?.value);
        if (cx != null && cy != null && r != null && r > 0 && a0 != null && a1 != null) {
          arcsEnAttente.push({ e, cx, cy, r, a0, a1 });
        } else {
          ignoredMap.set("ARC (incomplet)", (ignoredMap.get("ARC (incomplet)") ?? 0) + 1);
        }
        break;
      }
      case "CIRCLE": {
        const cx = num(e.pairs.find((p) => p.code === 10)?.value);
        const cy = num(e.pairs.find((p) => p.code === 20)?.value);
        const r = num(e.pairs.find((p) => p.code === 40)?.value);
        if (cx != null && cy != null && r != null && r > 0) {
          arcsEnAttente.push({ e, cx, cy, r, a0: 0, a1: 360 });
        } else {
          ignoredMap.set("CIRCLE (incomplet)", (ignoredMap.get("CIRCLE (incomplet)") ?? 0) + 1);
        }
        break;
      }
      default:
        ignoredMap.set(e.type, (ignoredMap.get(e.type) ?? 0) + 1);
    }
  }
  if (polylineOuverte) {
    // POLYLINE sans SEQEND : fichier tronqué. On garde ce qui a été lu.
    if (polylineOuverte.pts.length >= 2) {
      brutes.push({
        pts: polylineOuverte.pts,
        layer: polylineOuverte.layer,
        closed: polylineOuverte.closed,
        source: "POLYLINE",
      });
    }
    warnings.push("Une POLYLINE n'est pas refermée par SEQEND : fichier probablement tronqué.");
  }

  // Étendue brute, arcs compris par leur boîte englobante.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const avale = (p: Vec2) => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  };
  for (const b of brutes) for (const p of b.pts) avale(p);
  for (const a of arcsEnAttente) {
    avale({ x: a.cx - a.r, y: a.cy - a.r });
    avale({ x: a.cx + a.r, y: a.cy + a.r });
  }
  const spanBrut = Number.isFinite(minX) ? Math.max(maxX - minX, maxY - minY) : 0;

  // Choix de l'unité.
  let code: number;
  let factor: number;
  let inferred: boolean;
  if (opts.forceUnit != null && FACTEURS[opts.forceUnit] != null) {
    code = opts.forceUnit;
    factor = FACTEURS[opts.forceUnit]!;
    inferred = false;
  } else if (declared != null && declared !== 0 && FACTEURS[declared] != null) {
    code = declared;
    factor = FACTEURS[declared]!;
    inferred = false;
    // Une en-tête peut mentir : on le signale sans passer outre, car elle
    // reste l'intention déclarée de celui qui a produit le fichier.
    const span = spanBrut * factor;
    if (spanBrut > 0 && (span < 0.5 || span > 5000)) {
      const deduit = inferUnit(spanBrut);
      warnings.push(
        `L'en-tête déclare des ${NOMS_UNITE[code] ?? code} — le dessin ferait alors ${span.toFixed(1)} m. ` +
          `L'ordre de grandeur suggère plutôt des ${NOMS_UNITE[deduit.code] ?? deduit.code}.`,
      );
    }
  } else {
    const deduit = inferUnit(spanBrut);
    code = deduit.code;
    factor = deduit.factor;
    inferred = true;
    if (declared === 0) warnings.push("L'en-tête déclare « sans unité » : l'unité a été déduite de la taille du dessin.");
    else warnings.push("Aucune unité déclarée : elle a été déduite de la taille du dessin.");
  }

  // Seconde passe : conversion, et discrétisation des arcs à la bonne échelle.
  const sagittaMonde = opts.sagitta ?? 0.01;
  const sagittaBrutUnite = factor > 0 ? sagittaMonde / factor : sagittaBrut;
  const polylines: DxfPolyline[] = [];
  const conv = (p: Vec2): Vec2 => ({ x: p.x * factor, y: p.y * factor });

  for (const b of brutes) {
    polylines.push({ points: b.pts.map(conv), layer: b.layer, closed: b.closed, source: b.source });
  }
  for (const a of arcsEnAttente) {
    const pts = arcPoints(a.cx, a.cy, a.r, a.a0, a.a1, sagittaBrutUnite);
    if (pts.length >= 2) {
      polylines.push({
        points: pts.map(conv),
        layer: a.e.layer,
        closed: a.e.type === "CIRCLE",
        source: a.e.type === "CIRCLE" ? "CIRCLE" : "ARC",
      });
    }
  }
  arcsEnAttente = [];

  const layerMap = new Map<string, number>();
  for (const p of polylines) layerMap.set(p.layer, (layerMap.get(p.layer) ?? 0) + 1);

  // L'étendue se mesure sur les points CONVERTIS, pas en remultipliant les
  // bornes brutes : deux conversions indépendantes de la même grandeur
  // finissent toujours par diverger. Elle gagne aussi en justesse, la boîte
  // brute prenant un arc de 90° pour un cercle entier.
  let eMinX = Infinity;
  let eMinY = Infinity;
  let eMaxX = -Infinity;
  let eMaxY = -Infinity;
  for (const pl of polylines) {
    for (const p of pl.points) {
      if (p.x < eMinX) eMinX = p.x;
      if (p.y < eMinY) eMinY = p.y;
      if (p.x > eMaxX) eMaxX = p.x;
      if (p.y > eMaxY) eMaxY = p.y;
    }
  }
  const extent = Number.isFinite(eMinX)
    ? {
        min: { x: eMinX, y: eMinY },
        max: { x: eMaxX, y: eMaxY },
        width: eMaxX - eMinX,
        height: eMaxY - eMinY,
      }
    : null;

  if (polylines.length === 0 && entities.length > 0) {
    warnings.push("Aucune géométrie exploitable : le fichier ne contient ni ligne, ni polyligne, ni arc.");
  }

  return {
    polylines,
    layers: [...layerMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    unit: { code, factor, label: NOMS_UNITE[code] ?? String(code), inferred, ...(declared != null ? { declared } : {}) },
    extent,
    ignored: [...ignoredMap.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
    warnings,
  };
}

export interface DxfSketch {
  layers: { id: string; name: string; visible: boolean; locked: boolean; opacity: number }[];
  strokes: { id: string; layerId: string; storyId: string; points: Vec2[]; width: number; color: string }[];
  /** Translation appliquée pour ramener le dessin près de l'origine, en mètres. */
  recentered: Vec2;
}

/**
 * Transforme le résultat d'un import en calques d'esquisse, prêts à être
 * tracés par-dessus — c'est la chaîne Relevé qui existe déjà.
 *
 * Le recentrage n'est pas cosmétique : un DXF de géomètre est presque toujours
 * en coordonnées nationales. Un plan en Lambert 93 place le bâtiment à
 * 650 000 m de l'origine, où le cadrage de FORMA et la précision du flottant
 * ne servent plus à rien. On ramène donc le coin bas-gauche près de zéro et on
 * rend la translation, pour qui voudrait revenir aux coordonnées d'origine.
 *
 * Déterministe : les identifiants sont indexés, jamais tirés au hasard.
 */
export function dxfToSketch(r: DxfImport, storyId: string, prefix = "dxf"): DxfSketch {
  const dx = r.extent ? -r.extent.min.x : 0;
  const dy = r.extent ? -r.extent.min.y : 0;

  const noms = r.layers.length > 0 ? r.layers.map((l) => l.name) : ["0"];
  const layers = noms.map((name, i) => ({
    id: `${prefix}_ly_${i}`,
    name: name || "0",
    visible: true,
    locked: false,
    opacity: 0.85,
  }));
  const parNom = new Map(layers.map((l) => [l.name, l.id]));

  const strokes = r.polylines.map((pl, i) => {
    const pts = pl.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    // Une polyligne fermée se referme explicitement : le trait doit boucler à
    // l'écran, l'indicateur 70 ne se voit pas.
    if (pl.closed && pts.length > 2) {
      const a = pts[0]!;
      const z = pts[pts.length - 1]!;
      if (Math.abs(a.x - z.x) > 1e-9 || Math.abs(a.y - z.y) > 1e-9) pts.push({ x: a.x, y: a.y });
    }
    return {
      id: `${prefix}_st_${i}`,
      layerId: parNom.get(pl.layer) ?? layers[0]!.id,
      storyId,
      points: pts,
      width: 0.02,
      color: "#7a9e96",
    };
  });

  return { layers, strokes, recentered: { x: dx, y: dy } };
}

/** Résumé en une phrase, pour l'annoncer à l'utilisateur sans le noyer. */
export function describeDxfImport(r: DxfImport): string {
  if (r.polylines.length === 0) return r.warnings[0] ?? "Rien n'a pu être lu dans ce fichier.";
  const n = r.polylines.length;
  const cal = r.layers.length;
  const dim = r.extent ? ` · ${r.extent.width.toFixed(1)} × ${r.extent.height.toFixed(1)} m` : "";
  const unite = r.unit.inferred ? `${r.unit.label} (déduits)` : r.unit.label;
  const perdu = r.ignored.reduce((s, i) => s + i.count, 0);
  const reste = perdu > 0 ? ` · ${perdu} entité${perdu > 1 ? "s" : ""} non lue${perdu > 1 ? "s" : ""}` : "";
  return `${n} polyligne${n > 1 ? "s" : ""} · ${cal} calque${cal > 1 ? "s" : ""} · ${unite}${dim}${reste}`;
}
