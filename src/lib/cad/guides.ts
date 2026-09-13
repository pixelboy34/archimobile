import { dist, distToSegment } from "../bim/geometry";
import { snapDetail, type SnapHit } from "../bim/snap";
import type { Project, Vec2, Wall } from "../bim/types";

/**
 * Guides de tracé — alignements, équidistances et saisie de cote.
 *
 * Le magnétisme du projet (`snapDetail`) n'accroche que de la matière déjà
 * posée : une extrémité, un milieu, un poteau, sinon la trame. Il ne sait donc
 * pas aligner un mur neuf sur un mur éloigné, ni répartir des trumeaux égaux,
 * ni tenir une cote. Ces guides couvrent ce manque et se composent avec lui :
 * la matière l'emporte toujours, les guides ne servent que là où il n'y a rien
 * à toucher.
 *
 * Tout est en mètres, dans le plan XZ du projet (`Vec2.y` = Z monde).
 */

const DEG = Math.PI / 180;

/** Tolérance par défaut. L'interface la dérive plutôt de l'échelle d'écran. */
export const GUIDE_TOL = 0.2;
/** Au-delà, la droite traverse le plan sans rapport avec le geste. */
const PORTEE_MAX = 40;
/** En deçà, le guide ferait doublon avec le magnétisme sur point. */
const PORTEE_MIN = 0.6;
/** Marge le long d'un mur avant de parler de prolongement d'axe. */
const MARGE_AXE = 0.02;
/** Écart angulaire admis pour déclarer deux murs parallèles (~1,5°). */
const SIN_PARALLELE = Math.sin(1.5 * DEG);
/** Entraxe maximal d'une paire de murs candidate à l'équidistance. */
const ENTRAXE_MAX = 24;
/** Murs retenus pour l'appairage : borne le coût quadratique sur un R+80. */
const PAIRES_MAX = 24;
/** Un mur plus court n'a pas d'axe exploitable. */
const MUR_MIN = 0.2;

export type GuideForm = "ligne" | "distance";

export type GuideKind = "axe" | "perpendiculaire" | "alignement" | "equidistance" | "longueur";

export interface Guide {
  /** `ligne` : droite infinie. `distance` : longueur imposée depuis `origin`. */
  form: GuideForm;
  kind: GuideKind;
  /** Libellé court, français, prêt pour l'étiquette du curseur. */
  label: string;
  /** Droite : un point de la droite. Distance : l'origine de la cote. */
  origin: Vec2;
  /** Droite : direction unitaire. Distance : direction origine → point testé. */
  dir: Vec2;
  /** Distance : longueur visée. Droite : 0. */
  length: number;
  /** Écart du point testé à ce guide, en mètres. */
  ecart: number;
  /** Point du guide le plus proche du point testé. */
  point: Vec2;
  /** Identifiants des éléments dont le guide découle. */
  sourceIds: string[];
}

export interface GuideOptions {
  /** Rayon d'accrochage aux guides, en mètres. */
  tolerance?: number;
  /** Nombre maximal de DROITES rendues. Au-delà de trois le plan devient illisible. */
  max?: number;
  /** Origine du segment en cours de tracé. */
  draft?: Vec2 | null;
  /** Longueur du segment précédent de la polyligne, pour la reprise de cote. */
  previousLength?: number;
}

export interface ResolveOptions extends GuideOptions {
  /** Trame active, comme le magnétisme du store. */
  useGrid?: boolean;
  /** Rayon du magnétisme ponctuel. */
  snapRadius?: number;
  /** Pas de trame. */
  snapStep?: number;
  /** Rayon imposé par le verrou orthogonal : le point retenu y reste. */
  contrainte?: { origin: Vec2; dir: Vec2 } | null;
}

export interface GuideResolution {
  /** Point retenu, à poser tel quel. */
  point: Vec2;
  /** Raison retenue, en français, prête pour le bandeau d'état. */
  raison: string;
  /** Guides effectivement appliqués : au plus deux droites et une cote. */
  retenus: Guide[];
  /** Guides actifs pour ce point, à dessiner. */
  actifs: Guide[];
  /** Magnétisme ponctuel calculé au passage. */
  snap: SnapHit;
}

function unitDir(a: Vec2, b: Vec2): Vec2 | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return null;
  return { x: dx / len, y: dy / len };
}

function normalOf(dir: Vec2): Vec2 {
  return { x: -dir.y, y: dir.x };
}

/** Projection orthogonale de `p` sur la droite (origin, dir). `t` en mètres. */
function projectOnLine(p: Vec2, origin: Vec2, dir: Vec2): { point: Vec2; t: number; ecart: number } {
  const t = (p.x - origin.x) * dir.x + (p.y - origin.y) * dir.y;
  const point = { x: origin.x + dir.x * t, y: origin.y + dir.y * t };
  return { point, t, ecart: dist(p, point) };
}

/**
 * Clé canonique d'une droite : deux formulations de la même droite doivent la
 * partager, sans quoi l'axe d'un mur vertical et l'alignement sur son extrémité
 * seraient dessinés deux fois exactement l'un sur l'autre.
 */
function lineKey(origin: Vec2, dir: Vec2): string {
  let theta = Math.atan2(dir.y, dir.x);
  if (theta < 0) theta += Math.PI;
  if (theta >= Math.PI - 1e-9) theta = 0;
  const n = { x: -Math.sin(theta), y: Math.cos(theta) };
  const offset = n.x * origin.x + n.y * origin.y;
  return `${Math.round(theta * 1e4)}|${Math.round(offset * 1e3)}`;
}

/** Écart d'un point à un guide déjà construit, en mètres. */
export function ecartAuGuide(g: Guide, p: Vec2): number {
  if (g.form === "distance") return Math.abs(dist(g.origin, p) - g.length);
  const n = normalOf(g.dir);
  return Math.abs(n.x * (p.x - g.origin.x) + n.y * (p.y - g.origin.y));
}

/**
 * Croisement de deux droites. Deux droites parallèles ou rasantes le renvoient
 * à l'infini ou en NaN : c'est l'appelant qui écarte le résultat, en vérifiant
 * que le croisement tombe dans la zone du geste. Un seuil d'angle ici serait
 * redondant — et intestable, puisque le contrôle de distance le devance
 * toujours.
 */
function intersection(a: Guide, b: Guide): Vec2 | null {
  const cross = a.dir.x * b.dir.y - a.dir.y * b.dir.x;
  const ox = b.origin.x - a.origin.x;
  const oy = b.origin.y - a.origin.y;
  const t = (ox * b.dir.y - oy * b.dir.x) / cross;
  return { x: a.origin.x + a.dir.x * t, y: a.origin.y + a.dir.y * t };
}

/** Points du cercle (centre, rayon) posés sur une droite. Vide si pas d'intersection. */
function cercleDroite(centre: Vec2, rayon: number, g: Guide): Vec2[] {
  const pied = projectOnLine(centre, g.origin, g.dir);
  const h2 = rayon * rayon - pied.ecart * pied.ecart;
  if (h2 < 0) return [];
  const h = Math.sqrt(h2);
  if (h < 1e-9) return [pied.point];
  return [
    { x: pied.point.x + g.dir.x * h, y: pied.point.y + g.dir.y * h },
    { x: pied.point.x - g.dir.x * h, y: pied.point.y - g.dir.y * h },
  ];
}

function cote(n: number): string {
  return `${n.toFixed(2).replace(".", ",")} m`;
}

/**
 * Guides actifs pour un point donné.
 *
 * Rend au plus `max` droites (les plus proches du point), plus l'éventuel guide
 * de distance : celui-ci se dessine par un simple repère sur le segment, il
 * n'ajoute pas de trait au plan et ne compte donc pas dans le plafond.
 */
export function activeGuides(
  p: Vec2,
  project: Project,
  storyId: string,
  opts: GuideOptions = {},
): Guide[] {
  const tol = opts.tolerance ?? GUIDE_TOL;
  const max = opts.max ?? 3;
  const murs = project.walls.filter((w) => w.storyId === storyId && dist(w.a, w.b) >= MUR_MIN);
  const lignes: Guide[] = [];
  const vues = new Set<string>();

  const pousser = (g: Guide) => {
    const k = lineKey(g.origin, g.dir);
    if (vues.has(k)) return;
    vues.add(k);
    lignes.push(g);
  };

  // 1. Prolongement de l'axe des murs. Sur le mur lui-même, le magnétisme
  //    « milieu » de snapDetail fait déjà le travail : seul l'au-delà est un guide.
  for (const w of murs) {
    const dir = unitDir(w.a, w.b);
    if (!dir) continue;
    const hit = projectOnLine(p, w.a, dir);
    if (hit.ecart > tol) continue;
    const len = dist(w.a, w.b);
    const debord = hit.t < 0 ? -hit.t : hit.t - len;
    if (debord < MARGE_AXE || debord > PORTEE_MAX) continue;
    pousser({
      form: "ligne",
      kind: "axe",
      label: "Axe",
      origin: w.a,
      dir,
      length: 0,
      ecart: hit.ecart,
      point: hit.point,
      sourceIds: [w.id],
    });
  }

  // 2. Perpendiculaires aux extrémités : le retour d'équerre d'un refend.
  for (const w of murs) {
    const dir = unitDir(w.a, w.b);
    if (!dir) continue;
    const n = normalOf(dir);
    for (const q of [w.a, w.b]) {
      const hit = projectOnLine(p, q, n);
      if (hit.ecart > tol) continue;
      const portee = Math.abs(hit.t);
      if (portee < PORTEE_MIN || portee > PORTEE_MAX) continue;
      pousser({
        form: "ligne",
        kind: "perpendiculaire",
        label: "Perpendiculaire",
        origin: q,
        dir: n,
        length: 0,
        ecart: hit.ecart,
        point: hit.point,
        sourceIds: [w.id],
      });
    }
  }

  // 3. Alignement sur les points déjà posés — extrémités de murs et poteaux,
  //    les deux ancres que le dessinateur reconnaît sur son plan.
  const ancres: { p: Vec2; id: string }[] = [];
  for (const w of murs) {
    ancres.push({ p: w.a, id: w.id }, { p: w.b, id: w.id });
  }
  for (const c of project.columns) {
    if (c.storyId === storyId) ancres.push({ p: c.position, id: c.id });
  }
  const AXES: { dir: Vec2; label: string }[] = [
    { dir: { x: 0, y: 1 }, label: "Alignement" },
    { dir: { x: 1, y: 0 }, label: "Alignement" },
  ];
  for (const ancre of ancres) {
    for (const axe of AXES) {
      const hit = projectOnLine(p, ancre.p, axe.dir);
      if (hit.ecart > tol) continue;
      const portee = Math.abs(hit.t);
      if (portee < PORTEE_MIN || portee > PORTEE_MAX) continue;
      pousser({
        form: "ligne",
        kind: "alignement",
        label: axe.label,
        origin: ancre.p,
        dir: axe.dir,
        length: 0,
        ecart: hit.ecart,
        point: hit.point,
        sourceIds: [ancre.id],
      });
    }
  }

  // 4. Équidistance entre deux murs parallèles : l'axe médian. C'est ce qui
  //    permet de centrer une baie ou de répartir des trumeaux égaux sans calcul.
  const proches: { w: Wall; dir: Vec2; n: Vec2; offset: number }[] = [];
  for (const w of murs) {
    const dir = unitDir(w.a, w.b);
    if (!dir) continue;
    const n = normalOf(dir);
    const offset = n.x * w.a.x + n.y * w.a.y;
    if (Math.abs(n.x * p.x + n.y * p.y - offset) > ENTRAXE_MAX) continue;
    proches.push({ w, dir, n, offset });
  }
  proches.sort(
    (l, r) =>
      Math.abs(l.n.x * p.x + l.n.y * p.y - l.offset) - Math.abs(r.n.x * p.x + r.n.y * p.y - r.offset),
  );
  const paires = proches.slice(0, PAIRES_MAX);
  for (let i = 0; i < paires.length; i++) {
    const A = paires[i]!;
    for (let j = i + 1; j < paires.length; j++) {
      const B = paires[j]!;
      if (Math.abs(A.dir.x * B.dir.y - A.dir.y * B.dir.x) > SIN_PARALLELE) continue;
      const offsetB = A.n.x * B.w.a.x + A.n.y * B.w.a.y;
      const entraxe = Math.abs(offsetB - A.offset);
      if (entraxe < 0.3 || entraxe > ENTRAXE_MAX) continue;
      const median = (A.offset + offsetB) / 2;
      const ecart = Math.abs(A.n.x * p.x + A.n.y * p.y - median);
      if (ecart > tol) continue;
      // Le guide ne vaut que dans la travée : au-delà des abouts, deux murs
      // parallèles lointains produiraient une médiane sans aucun sens.
      if (distToSegment(p, A.w.a, A.w.b).dist > entraxe) continue;
      if (distToSegment(p, B.w.a, B.w.b).dist > entraxe) continue;
      const origin = { x: A.n.x * median, y: A.n.y * median };
      const hit = projectOnLine(p, origin, A.dir);
      pousser({
        form: "ligne",
        kind: "equidistance",
        label: `Équidistance ${cote(entraxe / 2)}`,
        origin,
        dir: A.dir,
        length: 0,
        ecart,
        point: hit.point,
        sourceIds: [A.w.id, B.w.id],
      });
    }
  }

  lignes.sort((l, r) => l.ecart - r.ecart);
  const sortie = lignes.slice(0, Math.max(0, max));

  // 5. Reprise de la longueur du segment précédent.
  const origine = opts.draft ?? null;
  const reprise = opts.previousLength ?? 0;
  if (origine && reprise > MUR_MIN) {
    const d = dist(origine, p);
    const ecart = Math.abs(d - reprise);
    if (ecart <= tol) {
      const dir = unitDir(origine, p) ?? { x: 1, y: 0 };
      sortie.push({
        form: "distance",
        kind: "longueur",
        label: `Longueur ${cote(reprise)}`,
        origin: origine,
        dir,
        length: reprise,
        ecart,
        point: { x: origine.x + dir.x * reprise, y: origine.y + dir.y * reprise },
        sourceIds: [],
      });
    }
  }

  return sortie;
}

const RAISON_SNAP: Record<string, string> = {
  end: "Extrémité",
  mid: "Milieu",
  col: "Poteau",
  grid: "Trame",
  none: "Libre",
};

/**
 * Point retenu et raison retenue, à partir du point brut, des guides et du
 * magnétisme existant.
 *
 * Ordre de priorité, du plus fort au plus faible :
 *   1. matière touchée (extrémité, milieu de mur, poteau) — intention explicite ;
 *   2. croisement de deux guides — le point y est entièrement déterminé ;
 *   3. un guide seul — projection orthogonale, ou report de cote ;
 *   4. trame, sinon le point brut.
 */
export function resolveGuidedPoint(
  brut: Vec2,
  project: Project,
  storyId: string,
  opts: ResolveOptions = {},
): GuideResolution {
  const tol = opts.tolerance ?? GUIDE_TOL;
  const snap = snapDetail(
    brut,
    project,
    storyId,
    opts.useGrid ?? false,
    opts.snapRadius ?? 0.35,
    opts.snapStep,
  );
  const actifs = activeGuides(brut, project, storyId, opts);

  if (snap.kind === "end" || snap.kind === "mid" || snap.kind === "col") {
    return { point: snap.point, raison: RAISON_SNAP[snap.kind]!, retenus: [], actifs, snap };
  }

  const lignes = actifs.filter((g) => g.form === "ligne");
  const distanceGuide = actifs.find((g) => g.form === "distance") ?? null;
  if (!lignes.length && !distanceGuide) {
    return { point: snap.point, raison: RAISON_SNAP[snap.kind]!, retenus: [], actifs, snap };
  }

  let point: Vec2 | null = null;
  let retenus: Guide[] = [];

  if (lignes.length >= 2) {
    const base = lignes[0]!;
    for (let j = 1; j < lignes.length && !point; j++) {
      const x = intersection(base, lignes[j]!);
      // Deux guides rasants se croisent loin du doigt : le croisement ne vaut
      // que s'il reste dans la zone du geste.
      if (x && dist(x, brut) <= tol * 3) {
        point = x;
        retenus = [base, lignes[j]!];
      }
    }
  }
  if (!point && lignes.length) {
    point = lignes[0]!.point;
    retenus = [lignes[0]!];
  }

  if (distanceGuide) {
    if (retenus.length >= 2 && point) {
      if (Math.abs(dist(distanceGuide.origin, point) - distanceGuide.length) <= tol) {
        retenus.push(distanceGuide);
      }
    } else if (retenus.length === 1 && point) {
      const sols = cercleDroite(distanceGuide.origin, distanceGuide.length, retenus[0]!);
      if (sols.length) {
        point = sols.reduce((best, s) => (dist(s, brut) < dist(best, brut) ? s : best), sols[0]!);
        retenus.push(distanceGuide);
      }
    } else {
      point = distanceGuide.point;
      retenus = [distanceGuide];
    }
  }

  if (!point) {
    return { point: snap.point, raison: RAISON_SNAP[snap.kind]!, retenus: [], actifs, snap };
  }

  // Le verrou orthogonal prime : un guide peut fixer la cote le long du rayon,
  // jamais en faire sortir le point.
  const contrainte = opts.contrainte ?? null;
  if (contrainte) {
    const t = Math.max(
      0,
      (point.x - contrainte.origin.x) * contrainte.dir.x +
        (point.y - contrainte.origin.y) * contrainte.dir.y,
    );
    point = {
      x: contrainte.origin.x + contrainte.dir.x * t,
      y: contrainte.origin.y + contrainte.dir.y * t,
    };
    const survivants = retenus.filter((g) => ecartAuGuide(g, point!) <= tol);
    if (!survivants.length) {
      return { point, raison: "Ortho", retenus: [], actifs, snap };
    }
    retenus = survivants;
  }

  return {
    point,
    raison: retenus.map((g) => g.label).join(" · "),
    retenus,
    actifs,
    snap,
  };
}

/**
 * Point d'arrivée d'un segment de longueur et d'angle imposés.
 *
 * `angle` en radians, sens trigonométrique, 0 = +X (est du plan).
 */
export function coteToPoint(origin: Vec2, longueur: number, angle: number): Vec2 {
  return {
    x: origin.x + Math.cos(angle) * longueur,
    y: origin.y + Math.sin(angle) * longueur,
  };
}

/** Angle du segment `from` → `to`, en radians. 0 si les deux points coïncident. */
export function angleEntre(from: Vec2, to: Vec2): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.hypot(dx, dy) < 1e-9) return 0;
  return Math.atan2(dy, dx);
}

/** Cote saisie au pavé numérique : « 3,20 », « 3.2 », « 3,20 m ». Mètres. */
export function parseCote(saisie: string): number | null {
  // \s couvre l'espace fine insécable qu'un copier-coller de métré traîne avec lui.
  const brut = saisie.trim().replace(/\s/g, "").replace(",", ".").replace(/m$/i, "");
  if (!/^\d*\.?\d+$/.test(brut)) return null;
  const n = Number(brut);
  if (!Number.isFinite(n) || n <= 0 || n > 500) return null;
  return n;
}

/** Angle saisi en degrés. Rendu en radians, ramené dans ]-180°, 180°]. */
export function parseAngleDeg(saisie: string): number | null {
  const brut = saisie.trim().replace(/\s/g, "").replace(",", ".").replace(/°$/, "");
  if (!/^[+-]?\d*\.?\d+$/.test(brut)) return null;
  const n = Number(brut);
  if (!Number.isFinite(n) || Math.abs(n) > 3600) return null;
  let deg = n % 360;
  if (deg > 180) deg -= 360;
  if (deg <= -180) deg += 360;
  return deg * DEG;
}
