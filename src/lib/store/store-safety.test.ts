import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Le store est un module client : sonner écrit sa feuille de style à
// l'évaluation du module, zustand/persist lit localStorage. Sans ces bouchons
// l'import échoue avant la première assertion, d'où l'import dynamique plus bas.
const g = globalThis as unknown as Record<string, unknown>;
const mem = new Map<string, string>();
g.localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  get length() {
    return mem.size;
  },
};
g.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
});
const domNode = () => ({
  style: {},
  setAttribute() {},
  appendChild() {},
  insertBefore() {},
});
g.document = {
  getElementsByTagName: () => [domNode()],
  documentElement: domNode(),
  createElement: () => domNode(),
  createTextNode: () => domNode(),
  head: domNode(),
  body: domNode(),
  addEventListener() {},
  removeEventListener() {},
};
g.window = g;

const { useStudio } = await import("./project-store.ts");
const { seedProjects } = await import("../bim/seed.ts");
const { cloneProject } = await import("../bim/builder.ts");

type Studio = ReturnType<typeof useStudio.getState>;
const S = (): Studio => useStudio.getState();

/** Repart d'une pile de démos neuves, sans historique ni sélection résiduels. */
function freshStore(openName: string): string {
  useStudio.setState({
    projects: seedProjects(),
    currentId: null,
    storyId: null,
    selectedIds: [],
    history: [],
    future: [],
    collabRoom: null,
    collabLocalEpoch: 0,
    collabReceivedEpoch: 0,
  });
  const p = S().projects.find((x) => x.name === openName)!;
  S().openProject(p.id);
  return p.id;
}

describe("applyRemoteProject — la synchro n'efface pas le projet local", () => {
  it("garde la maquette locale courante dans la liste quand un pair en pousse une autre", () => {
    const tourId = freshStore("Tour Horizon");
    const avant = S().projects.map((p) => p.name);
    const murs = S().current()!.walls.length;
    assert.ok(murs > 0);

    const villa = S().projects.find((p) => p.name === "Villa Calanque")!;
    const remote = {
      ...cloneProject(villa),
      id: "remote-alice-1",
      name: "Maquette Alice",
      // Distant plus ancien d'un jour : même vieux, il écrasait le local.
      updatedAt: new Date(Date.now() - 86_400_000).toISOString(),
    };

    S().applyRemoteProject(remote, 1);

    const apres = S().projects;
    assert.ok(
      apres.some((p) => p.id === tourId),
      "Tour Horizon a disparu de la liste après la synchro",
    );
    assert.equal(apres.find((p) => p.id === tourId)!.walls.length, murs);
    for (const nom of avant) {
      assert.ok(apres.some((p) => p.name === nom), `${nom} a disparu`);
    }
    assert.ok(apres.some((p) => p.id === "remote-alice-1"));
    assert.equal(S().currentId, "remote-alice-1");
  });

  it("resolveCollabConflict « take » n'efface pas non plus le projet local", () => {
    const tourId = freshStore("Tour Horizon");
    const villa = S().projects.find((p) => p.name === "Villa Calanque")!;
    const remote = {
      ...cloneProject(villa),
      id: "remote-alice-2",
      name: "Maquette Bob",
      updatedAt: new Date(Date.now() - 86_400_000).toISOString(),
    };

    // Force le chemin conflit : local plus récent que le dernier push.
    S().commit((p) => {
      p.meta = { ...p.meta, client: "local" };
      return p;
    });
    useStudio.setState({ collabRoom: "TEST", collabLocalEpoch: 5, collabReceivedEpoch: 0 });
    S().applyRemoteProject(remote, 1);
    S().applyRemoteProject(remote, 1);
    S().resolveCollabConflict("take");

    assert.ok(
      S().projects.some((p) => p.id === tourId),
      "Tour Horizon a disparu après résolution de conflit",
    );
  });
});

describe("removeStory — la pile reste continue", () => {
  it("recale les altitudes et renomme après suppression d'un niveau intermédiaire", () => {
    freshStore("Tour Horizon");
    const cible = S().current()!.stories.find((s) => s.name === "R+4")!;
    const nbAvant = S().current()!.stories.length;

    S().removeStory(cible.id);

    const st = S().current()!.stories;
    assert.equal(st.length, nbAvant - 1);
    for (let i = 1; i < st.length; i++) {
      const attendu = st[i - 1]!.elevation + st[i - 1]!.height;
      assert.ok(
        Math.abs(st[i]!.elevation - attendu) < 1e-6,
        `trou de ${(st[i]!.elevation - attendu).toFixed(2)} m sous ${st[i]!.name}`,
      );
    }
    assert.deepEqual(
      st.map((s) => s.name),
      ["RDC", "R+1", "R+2", "R+3", "R+4", "R+5", "R+6"],
    );
    const horsTout = st.at(-1)!.elevation + st.at(-1)!.height;
    assert.ok(Math.abs(horsTout - 20) < 1e-6, `hors-tout ${horsTout.toFixed(2)} m`);
  });

  it("signale la perte de couverture quand le niveau supprimé portait la dernière toiture", () => {
    freshStore("Tour Horizon");
    const porteuse = S().current()!.roofs[0]!.storyId;
    assert.equal(S().current()!.roofs.filter((r) => r.storyId !== porteuse).length, 0);
    S().removeStory(porteuse);
    assert.equal(S().current()!.roofs.length, 0);
  });

  it("emporte la géométrie du niveau supprimé", () => {
    freshStore("Tour Horizon");
    const cible = S().current()!.stories.find((s) => s.name === "R+4")!;
    S().removeStory(cible.id);
    const p = S().current()!;
    const ids = new Set(p.stories.map((s) => s.id));
    for (const w of p.walls) assert.ok(ids.has(w.storyId));
    for (const c of p.columns) assert.ok(ids.has(c.storyId));
    for (const f of p.furniture) assert.ok(ids.has(f.storyId));
  });
});

describe("resetExamples — ne détruit pas le travail", () => {
  it("conserve une démo modifiée et rafraîchit une démo intacte", () => {
    freshStore("Villa Calanque");
    const villaId = S().currentId!;
    const atelierId = S().projects.find((p) => p.name === "Atelier Voltaire")!.id;
    S().commit((p) => {
      p.meta = { ...p.meta, client: "Mme Roux" };
      p.walls = p.walls.slice(0, 3);
      return p;
    });
    const mursModifies = S().current()!.walls.length;

    S().resetExamples();

    const villa = S().projects.find((p) => p.id === villaId);
    assert.ok(villa, "la Villa Calanque modifiée a été remplacée par un seed neuf");
    assert.equal(villa!.walls.length, mursModifies);
    assert.equal(villa!.meta.client, "Mme Roux");
    // Une seule Villa : le seed neuf ne doit pas venir en doublon.
    assert.equal(S().projects.filter((p) => p.name === "Villa Calanque").length, 1);
    // La démo intacte, elle, est bien rafraîchie.
    assert.ok(
      !S().projects.some((p) => p.id === atelierId),
      "Atelier Voltaire intact aurait dû être rafraîchi",
    );
    assert.ok(S().projects.some((p) => p.name === "Atelier Voltaire"));
    // currentId ne doit jamais pointer dans le vide.
    assert.ok(S().current(), "current() est null après rafraîchissement");
  });

  it("laisse currentId sur un projet existant même quand la démo courante est rafraîchie", () => {
    freshStore("Atelier Voltaire");
    S().resetExamples();
    assert.ok(S().current(), "current() est null après rafraîchissement");
    assert.equal(S().current()!.name, "Atelier Voltaire");
    assert.ok(S().projects.some((p) => p.id === S().currentId));
  });

  it("ne rouvre pas un projet quand aucun n'était ouvert, et n'insère pas de doublon", () => {
    useStudio.setState({ projects: seedProjects(), currentId: null, history: [], future: [] });
    S().resetExamples();
    S().resetExamples();
    assert.equal(S().currentId, null);
    assert.equal(S().projects.length, 5);
  });

  it("conserve un projet vierge créé par l'utilisateur", () => {
    useStudio.setState({ projects: seedProjects(), currentId: null, history: [], future: [] });
    const id = S().createBlank("Chantier Nord");
    S().resetExamples();
    assert.ok(S().projects.some((p) => p.id === id));
    assert.equal(S().currentId, id);
  });
});

describe("moveSelectedStep — le nudge est annulable", () => {
  it("empile un instantané et Ctrl+Z ramène l'objet", () => {
    freshStore("Villa Calanque");
    const meuble = S().current()!.furniture[0]!;
    S().setStory(meuble.storyId);
    S().select([meuble.id]);
    const x0 = meuble.position.x;

    S().moveSelectedStep(0.5, 0);
    const bouge = S().current()!.furniture.find((f) => f.id === meuble.id)!;
    assert.ok(Math.abs(bouge.position.x - (x0 + 0.5)) < 1e-6);

    S().undo();
    const revenu = S().current()!.furniture.find((f) => f.id === meuble.id)!;
    assert.ok(
      Math.abs(revenu.position.x - x0) < 1e-6,
      `nudge non annulable : x=${revenu.position.x} au lieu de ${x0}`,
    );
  });

  it("coalesce une rafale en un seul instantané", () => {
    freshStore("Villa Calanque");
    const meuble = S().current()!.furniture[0]!;
    S().setStory(meuble.storyId);
    S().select([meuble.id]);
    const x0 = meuble.position.x;
    const hAvant = S().history.length;

    for (let i = 0; i < 5; i++) S().moveSelectedStep(0.1, 0);
    assert.equal(S().history.length, hAvant + 1, "une rafale ne doit empiler qu'un instantané");

    S().undo();
    const revenu = S().current()!.furniture.find((f) => f.id === meuble.id)!;
    assert.ok(Math.abs(revenu.position.x - x0) < 1e-6);
  });
});

describe("splitSelectedWall — un refus ne touche ni le projet ni l'historique", () => {
  it("coupe un mur libre et empile l'historique", () => {
    freshStore("Villa Calanque");
    const cur = S().current()!;
    const mur = cur.walls.find(
      (w) => w.storyId === cur.stories[0]!.id && !cur.openings.some((o) => o.wallId === w.id),
    )!;
    S().setStory(mur.storyId);
    S().select([mur.id]);
    const n = cur.walls.length;
    const h = S().history.length;

    S().splitSelectedWall();

    assert.equal(S().current()!.walls.length, n + 1);
    assert.equal(S().history.length, h + 1);
  });

  /** Pose une fenêtre au milieu exact du mur et renvoie le mur retenu. */
  function murAvecBaieAuMilieu() {
    const cur = S().current()!;
    const mur = cur.walls.find((w) => w.storyId === cur.stories[0]!.id)!;
    S().commit((p) => {
      p.openings.push({
        id: "op-test",
        wallId: mur.id,
        t: 0.5,
        kind: "window",
        width: 1.4,
        height: 1.35,
        sill: 0.9,
        variant: "casement",
        materialId: "glass",
      });
      return p;
    });
    S().setStory(mur.storyId);
    S().select([mur.id]);
    return mur;
  }

  it("contourne la baie au lieu de renoncer, et la laisse dans son mur", () => {
    // « Couper mur » visait le milieu géométrique, là où se trouve précisément
    // la fenêtre : la commande refusait sur 54 des 61 murs percés des démos.
    // Elle vise désormais le milieu du plus long trumeau et aboutit sur 61.
    freshStore("Villa Calanque");
    const mur = murAvecBaieAuMilieu();
    const n = S().current()!.walls.length;
    const h = S().history.length;

    S().splitSelectedWall();

    assert.equal(S().current()!.walls.length, n + 1, "la coupe aurait dû aboutir");
    assert.equal(S().history.length, h + 1);
    const apres = S().current()!;
    const baie = apres.openings.find((o) => o.id === "op-test")!;
    const hote = apres.walls.find((w) => w.id === baie.wallId)!;
    const len = Math.hypot(hote.b.x - hote.a.x, hote.b.y - hote.a.y);
    assert.ok(
      baie.t * len - baie.width / 2 >= -1e-6 && baie.t * len + baie.width / 2 <= len + 1e-6,
      "la baie doit tenir entière dans son mur d'accueil",
    );
    assert.ok(!apres.walls.some((w) => w.id === mur.id), "le mur visé est bien celui qui a été coupé");
  });

  it("refuse une coupe pointée sur une baie sans rien modifier", () => {
    // Le refus reste atteignable par le double-tap du plan, où c'est
    // l'utilisateur qui désigne le point de coupe.
    freshStore("Villa Calanque");
    const mur = murAvecBaieAuMilieu();
    const n = S().current()!.walls.length;
    const h = S().history.length;
    const avant = JSON.stringify(S().current()!.walls);

    S().splitWallAt({ x: (mur.a.x + mur.b.x) / 2, y: (mur.a.y + mur.b.y) / 2 }, mur.id);

    assert.equal(S().current()!.walls.length, n, "un refus a quand même coupé le mur");
    assert.equal(JSON.stringify(S().current()!.walls), avant);
    assert.equal(S().history.length, h, "un refus a quand même empilé l'historique");
  });
});
