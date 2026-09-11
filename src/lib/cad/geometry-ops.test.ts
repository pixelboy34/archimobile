import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { cloneProject } from "../bim/builder.ts";
import type { WallSegment } from "../bim/geometry.ts";
import { dist, lerp, wallLength, wallSolidSegments } from "../bim/geometry.ts";
import { seedProjects } from "../bim/seed.ts";
import type { Opening, Project, Vec2, Wall } from "../bim/types.ts";
import { splitWallAt } from "./ops.ts";

/** Bornes absolues de la baie le long de son mur d'accueil, en mètres. */
function openingSpan(project: Project, o: Opening): { len: number; lo: number; hi: number } | null {
  const host = project.walls.find((w) => w.id === o.wallId);
  if (!host) return null;
  const len = wallLength(host);
  return { len, lo: o.t * len - o.width / 2, hi: o.t * len + o.width / 2 };
}

function midOf(w: Wall): Vec2 {
  return { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
}

function testWall(over: Partial<Wall> = {}): Wall {
  return {
    id: "w1",
    storyId: "s0",
    a: { x: 0, y: 0 },
    b: { x: 10, y: 0 },
    thickness: 0.2,
    height: 2.8,
    materialId: "plaster",
    ...over,
  };
}

function testOpening(id: string, t: number, width: number): Opening {
  return {
    id,
    kind: "window",
    wallId: "w1",
    t,
    width,
    height: 1.2,
    sill: 0.9,
    materialId: "glass",
  };
}

function miniProject(walls: Wall[], openings: Opening[]): Project {
  const now = new Date().toISOString();
  return {
    id: "prj_test",
    name: "Test coupe",
    createdAt: now,
    updatedAt: now,
    meta: {},
    stories: [{ id: "s0", name: "RDC", elevation: 0, height: 2.8 }],
    walls,
    openings,
    rooms: [],
    slabs: [],
    roofs: [],
    columns: [],
    stairs: [],
    furniture: [],
    materials: {},
  } as unknown as Project;
}

/**
 * Appariement historique des bornes deux à deux, conservé ici comme témoin :
 * les baies disjointes doivent produire exactement les mêmes segments qu'avant.
 */
function legacySolidSegments(wall: Wall, openings: Opening[]): WallSegment[] {
  const len = wallLength(wall);
  if (len < 0.05) return [];
  const cuts: number[] = [0, 1];
  for (const o of openings) {
    if (o.wallId !== wall.id) continue;
    const half = o.width / 2 / len;
    cuts.push(Math.max(0, o.t - half), Math.min(1, o.t + half));
  }
  cuts.sort((a, b) => a - b);
  const segs: WallSegment[] = [];
  for (let i = 0; i < cuts.length - 1; i += 2) {
    const t0 = cuts[i]!;
    const t1 = cuts[i + 1]!;
    if (t1 - t0 < 0.01) continue;
    const a = lerp(wall.a, wall.b, t0);
    const b = lerp(wall.a, wall.b, t1);
    segs.push({ a, b, length: dist(a, b) });
  }
  return segs;
}

describe("splitWallAt — routage des baies par emprise", () => {
  it("ne laisse aucune baie déborder de son mur d'accueil, sur les cinq seeds", () => {
    const overflow: string[] = [];
    let done = 0;
    for (const seed of seedProjects()) {
      for (const story of seed.stories) {
        for (const w of seed.walls.filter((x) => x.storyId === story.id)) {
          const res = splitWallAt(cloneProject(seed), story.id, midOf(w));
          if (!res.ok) continue;
          done++;
          for (const o of res.project.openings) {
            const span = openingSpan(res.project, o);
            assert.ok(span, `baie ${o.id} orpheline après coupe (${seed.name}/${story.name})`);
            if (span.lo < -1e-6 || span.hi > span.len + 1e-6) {
              overflow.push(
                `${seed.name}/${story.name} mur ${span.len.toFixed(2)}m baie ${o.width.toFixed(2)}m ` +
                  `bords ${span.lo.toFixed(2)}..${span.hi.toFixed(2)}`,
              );
            }
          }
        }
      }
    }
    assert.ok(done > 20, `trop peu de coupes abouties (${done}), le test serait creux`);
    assert.deepEqual(overflow, [], `baies débordantes après coupe :\n${overflow.join("\n")}`);
  });

  it("route la baie entière du bon côté de la coupe", () => {
    // Baie de 1,20 m centrée à 2,00 m sur un mur de 10 m : entièrement avant la coupe à 5 m.
    const project = miniProject([testWall()], [testOpening("o1", 0.2, 1.2)]);
    const res = splitWallAt(cloneProject(project), "s0", { x: 5, y: 0 });
    assert.equal(res.ok, true);
    assert.equal(res.reason, null);
    const o = res.project.openings[0]!;
    const span = openingSpan(res.project, o)!;
    assert.ok(Math.abs(span.len - 5) < 1e-9, `mur d'accueil ${span.len}`);
    assert.ok(Math.abs(span.lo - 1.4) < 1e-9, `bord bas ${span.lo}`);
    assert.ok(Math.abs(span.hi - 2.6) < 1e-9, `bord haut ${span.hi}`);
  });

  it("refuse la coupe qui traverse une baie et laisse le projet intact", () => {
    // Baie de 3,60 m centrée à 4,20 m : emprise 2,40..6,00, la coupe à 5 m l'enjambe.
    const project = miniProject([testWall()], [testOpening("o1", 0.42, 3.6)]);
    const before = JSON.stringify(project);
    const res = splitWallAt(project, "s0", { x: 5, y: 0 });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "baie-traversee");
    assert.equal(JSON.stringify(res.project), before, "le projet a été modifié malgré le refus");
    assert.equal(JSON.stringify(project), before, "le projet appelant a été muté malgré le refus");
    assert.equal(project.walls.length, 1);
  });

  it("signale l'absence de mur sans toucher au projet", () => {
    const project = miniProject([testWall()], []);
    const before = JSON.stringify(project);
    const res = splitWallAt(project, "s0", { x: 5, y: 40 });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "aucun-mur");
    assert.equal(JSON.stringify(res.project), before);
  });

  it("coupe le mur désigné, même quand un voisin est plus proche du doigt", () => {
    // Deux murs parallèles espacés de 30 cm. Sans identifiant, la cible est
    // redéduite par proximité et c'est le voisin qui est coupé ; l'appelant
    // réel (double-tap du plan, « Couper mur ») connaît pourtant le mur touché.
    const visé = testWall({ id: "w1", a: { x: 0, y: 0 }, b: { x: 10, y: 0 } });
    const voisin = testWall({ id: "w2", a: { x: 0, y: 0.3 }, b: { x: 10, y: 0.3 } });
    const project = miniProject([visé, voisin], []);
    const doigt = { x: 5, y: 0.28 };

    const sansId = splitWallAt(cloneProject(project), "s0", doigt);
    assert.equal(sansId.ok, true);
    assert.ok(
      !sansId.project.walls.some((w) => w.id === "w2"),
      "sans identifiant, c'est bien le voisin le plus proche qui est coupé",
    );
    assert.ok(sansId.project.walls.some((w) => w.id === "w1"), "le mur visé reste intact");

    const avecId = splitWallAt(cloneProject(project), "s0", doigt, "w1");
    assert.equal(avecId.ok, true);
    assert.ok(
      !avecId.project.walls.some((w) => w.id === "w1"),
      "avec l'identifiant, c'est le mur désigné qui est coupé",
    );
    assert.ok(avecId.project.walls.some((w) => w.id === "w2"), "le voisin reste intact");
  });

  it("le milieu du plus long trumeau réussit là où le milieu géométrique échoue", () => {
    // C'est le point que vise « Couper mur » depuis project-store. Couper au
    // milieu géométrique tombait sur une baie dans l'immense majorité des murs
    // percés : la commande répondait « coupe impossible » sur presque toute
    // façade alors qu'un point valide existait à côté.
    let auMilieu = 0;
    let auTrumeau = 0;
    let percés = 0;
    for (const seed of seedProjects()) {
      for (const w of seed.walls) {
        if (!seed.openings.some((o) => o.wallId === w.id)) continue;
        percés++;
        if (splitWallAt(cloneProject(seed), w.storyId, midOf(w), w.id).ok) auMilieu++;

        const pleins = wallSolidSegments(w, seed.openings);
        const plusLong = pleins.reduce(
          (meilleur, s) => (s.length > meilleur.length ? s : meilleur),
          pleins[0] ?? { a: w.a, b: w.b, length: wallLength(w) },
        );
        const cible = { x: (plusLong.a.x + plusLong.b.x) / 2, y: (plusLong.a.y + plusLong.b.y) / 2 };
        if (splitWallAt(cloneProject(seed), w.storyId, cible, w.id).ok) auTrumeau++;
      }
    }
    assert.ok(percés > 20, `assez de murs percés pour conclure (${percés})`);
    assert.ok(
      auTrumeau > auMilieu,
      `le trumeau doit faire mieux que le milieu (${auTrumeau} contre ${auMilieu} sur ${percés})`,
    );
    // Le gain doit être massif, pas anecdotique : c'est la raison du changement.
    assert.ok(
      auTrumeau >= percés * 0.8,
      `au moins 80 % des murs percés redeviennent coupables (${auTrumeau}/${percés})`,
    );
  });

  it("refuse la coupe du mur désigné quand une baie l'enjambe", () => {
    const visé = testWall({ id: "w1", a: { x: 0, y: 0 }, b: { x: 10, y: 0 } });
    const voisin = testWall({ id: "w2", a: { x: 0, y: 0.3 }, b: { x: 10, y: 0.3 } });
    const project = miniProject([visé, voisin], [testOpening("o1", 0.5, 2)]);
    const res = splitWallAt(cloneProject(project), "s0", { x: 5, y: 0.02 }, "w1");
    assert.equal(res.ok, false, "le mur visé porte une baie sur la coupe : refus attendu");
    assert.equal(res.reason, "baie-traversee");
    assert.equal(res.project.walls.length, 2, "aucun mur ne doit avoir été coupé");
  });
});

describe("wallSolidSegments — baies chevauchantes", () => {
  it("ne fabrique aucun bloc plein entre deux baies qui se chevauchent", () => {
    // Deux clics de l'outil fenêtre à 1,00 m d'écart, largeur par défaut 1,40 m.
    const wall = testWall();
    const openings = [testOpening("o1", 0.4, 1.4), testOpening("o2", 0.5, 1.4)];
    const len = wallLength(wall);
    const trou = { lo: 0.4 * len - 0.7, hi: 0.5 * len + 0.7 };
    const segs = wallSolidSegments(wall, openings);
    for (const seg of segs) {
      const s0 = Math.min(seg.a.x, seg.b.x);
      const s1 = Math.max(seg.a.x, seg.b.x);
      assert.ok(
        s1 <= trou.lo + 1e-9 || s0 >= trou.hi - 1e-9,
        `segment plein ${s0.toFixed(2)}..${s1.toFixed(2)} dans la zone vitrée ${trou.lo}..${trou.hi}`,
      );
    }
    assert.equal(segs.length, 2, "un plein avant la baie fusionnée, un après");
  });

  it("fusionne aussi trois baies en cascade", () => {
    const wall = testWall();
    const openings = [testOpening("o1", 0.3, 1.4), testOpening("o2", 0.4, 1.4), testOpening("o3", 0.5, 1.4)];
    const segs = wallSolidSegments(wall, openings);
    assert.equal(segs.length, 2);
    assert.ok(Math.abs(segs[0]!.length - (0.3 * 10 - 0.7)) < 1e-9, `plein amont ${segs[0]!.length}`);
    assert.ok(Math.abs(segs[1]!.length - (10 - (0.5 * 10 + 0.7))) < 1e-9, `plein aval ${segs[1]!.length}`);
  });

  it("garde une baie englobée dans une autre sans rouvrir de plein", () => {
    const wall = testWall();
    const openings = [testOpening("o1", 0.5, 4), testOpening("o2", 0.5, 1)];
    const segs = wallSolidSegments(wall, openings);
    assert.equal(segs.length, 2);
    assert.ok(Math.abs(segs[0]!.length - 3) < 1e-9);
    assert.ok(Math.abs(segs[1]!.length - 3) < 1e-9);
  });

  it("rend exactement les mêmes segments qu'avant pour des baies disjointes", () => {
    const wall = testWall();
    const cases: Opening[][] = [
      [],
      [testOpening("o1", 0.5, 1.4)],
      [testOpening("o1", 0.2, 1), testOpening("o2", 0.7, 1.2)],
      [testOpening("o1", 0.02, 1.4), testOpening("o2", 0.6, 0.9)],
      [testOpening("o1", 0.35, 1), testOpening("o2", 0.98, 1.4)],
    ];
    for (const openings of cases) {
      assert.deepEqual(
        wallSolidSegments(wall, openings),
        legacySolidSegments(wall, openings),
        `régression sur ${openings.length} baie(s)`,
      );
    }
  });

  it("rend exactement les mêmes segments qu'avant sur tous les murs des seeds", () => {
    for (const seed of seedProjects()) {
      for (const w of seed.walls) {
        const openings = seed.openings.filter((o) => o.wallId === w.id);
        assert.deepEqual(
          wallSolidSegments(w, openings),
          legacySolidSegments(w, openings),
          `régression sur ${seed.name} mur ${w.id}`,
        );
      }
    }
  });
});
