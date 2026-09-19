import { dist, distToSegment, polygonArea, polygonCentroid, pointInPolygon, wallLength } from "./geometry";
import type { Project, Vec2 } from "./types";

/**
 * Contrôle de cohérence du modèle — les fautes de modélisation.
 *
 * `structure.ts` juge la descente de charges, `feasibility.ts` le règlement.
 * Il manquait ce qui fait qu'un IFC part chez le bureau d'études avec des
 * absurdités dedans : une baie plus large que son mur, deux poteaux au même
 * point, un escalier qui ne rejoint pas l'étage.
 *
 * Le risque de ce module n'est pas de rater un défaut, c'est d'en inventer
 * trente : un panneau qui crie au loup n'est plus jamais ouvert. Chaque règle
 * est donc calibrée pour sortir SILENCIEUSE sur les cinq projets de
 * démonstration et sur un volume généré, et `coherence.test.ts` le vérifie.
 * Une règle qu'on ne sait pas rendre silencieuse n'a pas sa place ici.
 *
 * Tout est pur et déterministe : mêmes entrées, même liste, même ordre.
 */

export type Severite = "critique" | "majeur" | "mineur";

export type NatureDefaut =
  | "orphelin"
  | "baie-chevauchement"
  | "baie-debordante"
  | "baie-orpheline"
  | "murs-croises"
  | "mur-degenere"
  | "poteau-double"
  | "poteau-noye"
  | "pieces-superposees"
  | "piece-degeneree"
  | "escalier-hauteur"
  | "escalier-pas";

export interface DefautCoherence {
  id: string;
  nature: NatureDefaut;
  severite: Severite;
  /** Phrase montrée telle quelle, en français, avec le chiffre qui la fonde. */
  message: string;
  /** Ouvrages en cause, pour que l'interface puisse les sélectionner. */
  cibles: string[];
  storyId?: string;
}

export interface RapportCoherence {
  defauts: DefautCoherence[];
  /** Nombre de défauts par nature, pour grouper sans recompter. */
  parNature: { nature: NatureDefaut; titre: string; severite: Severite; defauts: DefautCoherence[] }[];
  critiques: number;
  majeurs: number;
  mineurs: number;
  /** Vrai quand rien n'est à signaler : à dire franchement plutôt que d'afficher une liste vide. */
  sain: boolean;
}

export const TITRES: Record<NatureDefaut, string> = {
  orphelin: "Ouvrage rattaché à un niveau disparu",
  "baie-chevauchement": "Baies qui se chevauchent",
  "baie-debordante": "Baie qui déborde de son mur",
  "baie-orpheline": "Baie sans mur",
  "murs-croises": "Murs croisés sans jonction",
  "mur-degenere": "Mur de longueur nulle",
  "poteau-double": "Poteaux superposés",
  "poteau-noye": "Poteau noyé dans un mur",
  "pieces-superposees": "Pièces qui se recouvrent",
  "piece-degeneree": "Pièce sans surface",
  "escalier-hauteur": "Escalier qui ne rejoint pas le niveau",
  "escalier-pas": "Pas de marche hors des usages",
};

const ORDRE: NatureDefaut[] = [
  "orphelin",
  "baie-orpheline",
  "mur-degenere",
  "piece-degeneree",
  "baie-debordante",
  "baie-chevauchement",
  "murs-croises",
  "poteau-double",
  "escalier-hauteur",
  "pieces-superposees",
  "poteau-noye",
  "escalier-pas",
];

/** Tolérances, en mètres. Choisies au-dessus du bruit de saisie au doigt. */
const TOL = {
  /** Recouvrement de baies en deçà duquel on ne dit rien. */
  baie: 0.01,
  /** Débordement de baie toléré : une baie affleurant l'angle est licite. */
  debord: 0.02,
  /** Deux poteaux plus proches que cela sont le même poteau posé deux fois. */
  poteau: 0.05,
  /** Distance d'une extrémité de mur au croisement : en deçà, c'est une jonction. */
  jonction: 0.25,
  /** Longueur en deçà de laquelle un mur ne veut plus rien dire. */
  murNul: 0.01,
  /** Surface en deçà de laquelle une pièce ne veut plus rien dire. */
  pieceNulle: 0.5,
  /** Écart toléré entre la montée d'un escalier et la hauteur d'étage. */
  escalier: 0.05,
};

function fmt(n: number, d = 2): string {
  return n.toFixed(d).replace(".", ",");
}

/**
 * Intersection propre de deux segments : vraie seulement si le point tombe
 * strictement à l'intérieur des deux, ce qui exclut les jonctions en T et en L
 * où une extrémité rejoint l'autre mur — celles-là sont voulues.
 */
function croisement(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): Vec2 | null {
  const d1x = a2.x - a1.x;
  const d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x;
  const d2y = b2.y - b1.y;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-12) return null; // parallèles ou confondus
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / den;
  const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / den;
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
  return { x: a1.x + t * d1x, y: a1.y + t * d1y };
}

/**
 * Aire de recouvrement de deux polygones, estimée sur une grille fixe.
 *
 * Une intersection exacte de polygones demanderait un découpage complet pour
 * un gain nul ici : on cherche à savoir si deux pièces se marchent dessus, pas
 * à mesurer la zone au centimètre. La grille est fixe, donc le résultat est
 * reproductible — pas d'échantillonnage aléatoire dans le domaine.
 */
function recouvrement(a: Vec2[], b: Vec2[]): number {
  const bornes = (poly: Vec2[]) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of poly) {
      if (p.x < x0) x0 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.x > x1) x1 = p.x;
      if (p.y > y1) y1 = p.y;
    }
    return { x0, y0, x1, y1 };
  };
  const A = bornes(a);
  const B = bornes(b);
  const x0 = Math.max(A.x0, B.x0);
  const y0 = Math.max(A.y0, B.y0);
  const x1 = Math.min(A.x1, B.x1);
  const y1 = Math.min(A.y1, B.y1);
  if (x1 <= x0 || y1 <= y0) return 0;

  const N = 32;
  const dx = (x1 - x0) / N;
  const dy = (y1 - y0) / N;
  let dedans = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const p = { x: x0 + (i + 0.5) * dx, y: y0 + (j + 0.5) * dy };
      if (pointInPolygon(p, a) && pointInPolygon(p, b)) dedans++;
    }
  }
  return (dedans / (N * N)) * (x1 - x0) * (y1 - y0);
}

/** Demi-diagonale d'un poteau : son rayon d'encombrement, rotation comprise. */
function rayonPoteau(w: number, d: number): number {
  return Math.hypot(w, d) / 2;
}

export function checkCoherence(project: Project): RapportCoherence {
  const defauts: DefautCoherence[] = [];
  const pousse = (
    nature: NatureDefaut,
    severite: Severite,
    message: string,
    cibles: string[],
    storyId?: string,
  ) => {
    defauts.push({ id: `${nature}:${cibles.join("+")}`, nature, severite, message, cibles, storyId });
  };

  const etages = new Map(project.stories.map((s) => [s.id, s]));
  const nomEtage = (id: string | undefined) => (id ? (etages.get(id)?.name ?? "niveau inconnu") : "—");
  const murs = new Map(project.walls.map((w) => [w.id, w]));

  // --- Ouvrages rattachés à un niveau disparu -------------------------------
  // Le cas a déjà mordu : une régénération de volume laissait des murs et des
  // poteaux rattachés à un storyId supprimé, et le métré annonçait 597 610 €
  // au lieu de 83 085.
  const familles: { nom: string; items: { id: string; storyId: string }[] }[] = [
    { nom: "mur", items: project.walls },
    { nom: "pièce", items: project.rooms },
    { nom: "dalle", items: project.slabs },
    { nom: "toiture", items: project.roofs },
    { nom: "poteau", items: project.columns },
    { nom: "escalier", items: project.stairs },
    { nom: "objet", items: project.furniture },
  ];
  for (const f of familles) {
    const perdus = f.items.filter((it) => it.storyId && !etages.has(it.storyId));
    if (perdus.length > 0) {
      pousse(
        "orphelin",
        "critique",
        `${perdus.length} ${f.nom}${perdus.length > 1 ? "s" : ""} rattaché${perdus.length > 1 ? "s" : ""} à un niveau qui n'existe plus : compté${perdus.length > 1 ? "s" : ""} au métré et exporté${perdus.length > 1 ? "s" : ""} en IFC, invisible${perdus.length > 1 ? "s" : ""} à l'écran.`,
        perdus.map((p) => p.id),
      );
    }
  }

  // --- Murs dégénérés -------------------------------------------------------
  for (const w of project.walls) {
    if (wallLength(w) < TOL.murNul) {
      pousse("mur-degenere", "majeur", `Mur de longueur nulle sur ${nomEtage(w.storyId)}.`, [w.id], w.storyId);
    }
  }

  // --- Baies : mur disparu, débordement, chevauchement ----------------------
  const parMur = new Map<string, typeof project.openings>();
  for (const o of project.openings) {
    const hote = murs.get(o.wallId);
    if (!hote) {
      pousse("baie-orpheline", "critique", `Baie posée sur un mur qui n'existe plus.`, [o.id]);
      continue;
    }
    const liste = parMur.get(o.wallId) ?? [];
    liste.push(o);
    parMur.set(o.wallId, liste);
  }

  for (const [wallId, liste] of parMur) {
    const hote = murs.get(wallId)!;
    const len = wallLength(hote);
    if (len < TOL.murNul) continue;

    const spans = liste
      .map((o) => ({ o, lo: o.t * len - o.width / 2, hi: o.t * len + o.width / 2 }))
      .sort((x, y) => x.lo - y.lo);

    for (const s of spans) {
      if (s.o.width > len + TOL.debord) {
        pousse(
          "baie-debordante",
          "majeur",
          `Baie de ${fmt(s.o.width)} m sur un mur de ${fmt(len)} m : plus large que son mur.`,
          [s.o.id, wallId],
          hote.storyId,
        );
      } else if (s.lo < -TOL.debord || s.hi > len + TOL.debord) {
        const hors = Math.max(-s.lo, s.hi - len);
        pousse(
          "baie-debordante",
          "majeur",
          `Baie hors du mur de ${fmt(hors)} m sur ${nomEtage(hote.storyId)} : le percement réel est amputé d'autant.`,
          [s.o.id, wallId],
          hote.storyId,
        );
      }
    }

    for (let i = 0; i + 1 < spans.length; i++) {
      const a = spans[i]!;
      const b = spans[i + 1]!;
      const chevauche = a.hi - b.lo;
      if (chevauche > TOL.baie) {
        pousse(
          "baie-chevauchement",
          "majeur",
          `Deux baies se chevauchent de ${fmt(chevauche)} m sur le même mur : le trumeau entre elles n'existe pas.`,
          [a.o.id, b.o.id, wallId],
          hote.storyId,
        );
      }
    }
  }

  // --- Murs croisés sans jonction ------------------------------------------
  const parEtage = new Map<string, typeof project.walls>();
  for (const w of project.walls) {
    const l = parEtage.get(w.storyId) ?? [];
    l.push(w);
    parEtage.set(w.storyId, l);
  }
  for (const [storyId, liste] of parEtage) {
    for (let i = 0; i < liste.length; i++) {
      for (let j = i + 1; j < liste.length; j++) {
        const A = liste[i]!;
        const B = liste[j]!;
        const x = croisement(A.a, A.b, B.a, B.b);
        if (!x) continue;
        // Une extrémité proche du croisement, c'est un T ou un L : voulu.
        const proche = Math.min(dist(x, A.a), dist(x, A.b), dist(x, B.a), dist(x, B.b));
        if (proche <= TOL.jonction) continue;
        pousse(
          "murs-croises",
          "majeur",
          `Deux murs de ${nomEtage(storyId)} se croisent en plein milieu sans jonction : aucune extrémité à moins de ${fmt(proche)} m du croisement.`,
          [A.id, B.id],
          storyId,
        );
      }
    }
  }

  // --- Poteaux : doublons et poteaux noyés ---------------------------------
  const poteauxParEtage = new Map<string, typeof project.columns>();
  for (const c of project.columns) {
    const l = poteauxParEtage.get(c.storyId) ?? [];
    l.push(c);
    poteauxParEtage.set(c.storyId, l);
  }
  for (const [storyId, liste] of poteauxParEtage) {
    for (let i = 0; i < liste.length; i++) {
      for (let j = i + 1; j < liste.length; j++) {
        const A = liste[i]!;
        const B = liste[j]!;
        const d = dist(A.position, B.position);
        if (d <= TOL.poteau) {
          pousse(
            "poteau-double",
            "majeur",
            `Deux poteaux au même point sur ${nomEtage(storyId)} (${fmt(d, 3)} m d'écart) : l'un est compté en trop au métré.`,
            [A.id, B.id],
            storyId,
          );
        }
      }
    }
  }
  for (const c of project.columns) {
    // Un poteau est « noyé » quand il tient ENTIÈREMENT dans l'épaisseur d'un
    // mur : il ne porte rien de plus que le mur et n'est visible nulle part.
    // Un poteau plus large que le mur, lui, est un raidisseur légitime.
    const r = rayonPoteau(c.width, c.depth);
    for (const w of project.walls) {
      if (w.storyId !== c.storyId) continue;
      const h = distToSegment(c.position, w.a, w.b);
      if (h.t <= 0 || h.t >= 1) continue;
      if (r < w.thickness / 2 && h.dist + r <= w.thickness / 2) {
        pousse(
          "poteau-noye",
          "mineur",
          `Poteau entièrement noyé dans un mur de ${fmt(w.thickness)} m sur ${nomEtage(c.storyId)} : invisible et sans effet structurel.`,
          [c.id, w.id],
          c.storyId,
        );
        break;
      }
    }
  }

  // --- Pièces : dégénérées et superposées ----------------------------------
  const piecesParEtage = new Map<string, typeof project.rooms>();
  for (const r of project.rooms) {
    if (r.polygon.length < 3 || Math.abs(polygonArea(r.polygon)) < TOL.pieceNulle) {
      pousse(
        "piece-degeneree",
        "majeur",
        `« ${r.name || "Pièce"} » n'a pas de surface exploitable sur ${nomEtage(r.storyId)}.`,
        [r.id],
        r.storyId,
      );
      continue;
    }
    const l = piecesParEtage.get(r.storyId) ?? [];
    l.push(r);
    piecesParEtage.set(r.storyId, l);
  }
  for (const [storyId, liste] of piecesParEtage) {
    for (let i = 0; i < liste.length; i++) {
      for (let j = i + 1; j < liste.length; j++) {
        const A = liste[i]!;
        const B = liste[j]!;
        const aireA = Math.abs(polygonArea(A.polygon));
        const aireB = Math.abs(polygonArea(B.polygon));
        const petite = Math.min(aireA, aireB);
        const commun = recouvrement(A.polygon, B.polygon);
        // Deux pièces mitoyennes partagent une arête, jamais une surface : on
        // ne parle que d'un recouvrement franc, en absolu ET en proportion.
        if (commun > 1 && commun > petite * 0.15) {
          pousse(
            "pieces-superposees",
            "majeur",
            `« ${A.name || "Pièce"} » et « ${B.name || "Pièce"} » se recouvrent sur ${fmt(commun, 1)} m² : la surface est comptée deux fois.`,
            [A.id, B.id],
            storyId,
          );
        }
      }
    }
  }

  // --- Escaliers ------------------------------------------------------------
  for (const st of project.stairs) {
    const etage = etages.get(st.storyId);
    if (!etage) continue; // déjà signalé en orphelin

    // `rise` est la MONTÉE TOTALE de la volée, pas la hauteur d'une marche :
    // BuildingScene fait `stair.rise / count` pour obtenir le contremarche, et
    // l'inspecteur étiquette ce champ « Hauteur », de 2 à 6 m. La première
    // version de cette règle lisait `rise` comme une contremarche et criait sur
    // les 64 escaliers des projets de démonstration.
    const attendu = etage.height;
    if (attendu > 0 && Math.abs(st.rise - attendu) > TOL.escalier) {
      const sens = st.rise < attendu ? "n'atteint pas" : "dépasse";
      pousse(
        "escalier-hauteur",
        "majeur",
        `L'escalier de ${nomEtage(st.storyId)} ${sens} le niveau supérieur : il monte de ${fmt(st.rise)} m pour une hauteur d'étage de ${fmt(attendu)} m.`,
        [st.id],
        st.storyId,
      );
    }

    // Contremarche et giron, aux limites réglementaires et non de confort : on
    // ne signale que ce qui rend un escalier réellement impraticable, jamais un
    // simple écart à la formule de Blondel.
    const marches = Math.max(1, st.steps);
    const contremarche = st.rise / marches;
    const giron = st.run / marches;
    if (contremarche > 0.21 || (giron > 0 && giron < 0.22)) {
      const quoi =
        contremarche > 0.21 && giron < 0.22
          ? `contremarche de ${fmt(contremarche)} m et giron de ${fmt(giron)} m`
          : contremarche > 0.21
            ? `contremarche de ${fmt(contremarche)} m, au-delà des 0,21 m admis`
            : `giron de ${fmt(giron)} m, en deçà des 0,22 m admis`;
      pousse(
        "escalier-pas",
        "mineur",
        `Escalier difficilement praticable sur ${nomEtage(st.storyId)} : ${quoi}.`,
        [st.id],
        st.storyId,
      );
    }
  }

  // Ordre stable : par nature selon ORDRE, puis par identifiant.
  const rang = new Map(ORDRE.map((n, i) => [n, i]));
  defauts.sort((a, b) => (rang.get(a.nature)! - rang.get(b.nature)!) || a.id.localeCompare(b.id));

  const parNature = ORDRE.map((nature) => ({
    nature,
    titre: TITRES[nature],
    severite: (defauts.find((d) => d.nature === nature)?.severite ?? "mineur") as Severite,
    defauts: defauts.filter((d) => d.nature === nature),
  })).filter((g) => g.defauts.length > 0);

  return {
    defauts,
    parNature,
    critiques: defauts.filter((d) => d.severite === "critique").length,
    majeurs: defauts.filter((d) => d.severite === "majeur").length,
    mineurs: defauts.filter((d) => d.severite === "mineur").length,
    sain: defauts.length === 0,
  };
}

/** Phrase de synthèse, à montrer en tête du panneau. */
export function resumeCoherence(r: RapportCoherence): string {
  if (r.sain) return "Aucune incohérence détectée sur ce modèle.";
  const bouts: string[] = [];
  if (r.critiques > 0) bouts.push(`${r.critiques} critique${r.critiques > 1 ? "s" : ""}`);
  if (r.majeurs > 0) bouts.push(`${r.majeurs} majeur${r.majeurs > 1 ? "s" : ""}`);
  if (r.mineurs > 0) bouts.push(`${r.mineurs} mineur${r.mineurs > 1 ? "s" : ""}`);
  return bouts.join(" · ");
}

/** Aide au calibrage : centre approximatif d'un défaut, pour cadrer dessus. */
export function centreDefaut(project: Project, d: DefautCoherence): Vec2 | null {
  for (const id of d.cibles) {
    const w = project.walls.find((x) => x.id === id);
    if (w) return { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
    const c = project.columns.find((x) => x.id === id);
    if (c) return c.position;
    const r = project.rooms.find((x) => x.id === id);
    if (r && r.polygon.length >= 3) return polygonCentroid(r.polygon);
    const s = project.stairs.find((x) => x.id === id);
    if (s) return s.origin;
  }
  return null;
}
