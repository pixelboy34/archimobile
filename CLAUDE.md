# FORMA — brief Claude Code

Studio BIM / CAD **mobile-first** (PWA iPhone + Android), UI **française**.
Plus ambitieux qu’ArchiCAD sur téléphone : tracer, massing immeuble, visite 3D, AR, copilote IA, 4D, quantités.

**Ne pas recréer l’app.** Elle est jouable. Mission = parfaire géométrie, BIM, perfs d’immeubles, clarté du dock, et coller aux contraintes utilisateur ci-dessous.

---

## 0. Contraintes utilisateur (non négociables)

Issues répétées — les respecter **avant** toute « optimisation » :

1. **Ne jamais dégrader le rendu 3D.** PBR, ombres PCF, meubles composés, parcelle large, DPR jusqu’à 2. Un passage « perf » a déjà cassé la qualité ; l’utilisateur a exigé l’inverse (*enrichir*, pas diminuer).
2. **Paramètres vivants.** Le modèle 3D doit rester visible pendant qu’on règle. **Interdit** : Sheet / Dialog plein écran pour les params de modélisation. Utiliser `InspectorDock` (~46 dvh, bas).
3. **Menus groupés**, pas éparpillés. 4 onglets inspecteur : Ouvrage | Étages | Site | Vue. Studio (radial) : Matériaux, Bibliothèque, Structure, Copilote, 4D, Calques, Guide.
4. **Immeubles.** Massing R+n, noyau, rideau, sous-sol, `repeatStories` jusqu’à 80. Pas seulement des villas.
5. **Orbit maquette** = grab the model (`theta -= dx`). Sens **non inversé**. Mode `regard` existe mais n’est pas le défaut.
6. **PWA installable** (iPhone 17 Pro visé). Ne pas casser `grokPwaPlugin`, `public/__grok/`, apple-touch.
7. UI **française**, tons sombres, accent unique cyan `#6ed0c3` / `#7a9e96`, **pas d’emoji** dans l’UI.
8. Auth / Postgres **OFF**. Tout vit dans Zustand persist `localStorage` (`forma-studio-v9`). Ne pas allumer Better Auth.

---

## 1. Stack & commandes

| Couche | Choix |
|---|---|
| App | TanStack Start + React 19 + Vite 8 + TypeScript |
| Style | Tailwind v4, tokens `src/styles.css`, Syne / Outfit / IBM Plex Mono |
| 3D | Three 0.185 + R3F 9 + drei, `frameloop="demand"` (sauf visite) |
| Physique | Rapier `@dimforge/rapier3d-compat` — collision visite, optionnelle |
| État | Zustand v5 persist `forma-studio-v9` |
| BIM | modèle maison (pas de moteur IFC) |
| IA | `src/lib/ai/copilot.ts` → `api.x.ai` si `XAI_API_KEY`, sinon massing local |
| Tests BIM | `src/lib/bim/bim.test.ts` (**pas** dans `npm test`) |

```bash
npm run dev          # 0.0.0.0:8080 via scripts/with-app-env.mjs — JAMAIS vite direct
npm run verify       # LA porte : typage + tests BIM + 8 smokes métier (~45 s)
npm run verify:rapide  # idem sans le typecheck
npm run typecheck    # tsc --noEmit
npm run lint         # 0 erreur attendue
npm run build
```

**`npm run verify` avant chaque commit.** La CI le lance aussi. Elle ne
faisait que `tsc` jusqu'ici, et c'est ainsi qu'une réécriture du manifeste
PWA a tenu quatre jours : le typage restait vert pendant que l'application
s'installait sous le nom « Grok App » en noir au lieu de FORMA en `#6ed0c3`.
`scripts/forma-pwa-check.mjs` l'aurait vue — personne ne le lançait.

⚠️ Le dépôt reçoit des commits `chore: sauvegarde auto FORMA` poussés par
`scripts/backup-github.py` depuis l'espace Grok. Ils **écrasent** le travail
fait ici : ils ont déjà annulé le patch PWA (`grok-pwa-shared.mjs`) et
réintroduit `ContactShadows`, pourtant interdit au §5. Après un `git pull`,
relancer `npm run verify`.

Routes : `/` (`HomePage`) · `/studio/$projectId` (`StudioShell`).

Preview sandbox Grok : bind **`0.0.0.0:8080`**, `startup.sh` idempotent, ne pas toucher `public/__grok/`, `server/`, `scripts/grok-pwa-*`.

---

## 2. Carte du code (lignes ≈ actuelles)

```
src/
  components/
    home/HomePage.tsx            archives, Amateur/Expert, Nouveau / Générer / Importer
    studio/
      StudioShell.tsx      495   chrome : canvas overlay, HUD, dock, InspectorDock, sheets
      BuildingScene.tsx   1064   murs / dalles / toits / meubles / labels  ← GROS
      PropertiesPanel.tsx  614   4 onglets inspecteur
      Plan2D.tsx           574   dessin SVG 2D (snap, cotes, calques)
      Viewport3D.tsx       463   Canvas R3F, lumières, far/FOV, site
      OrbitRig.tsx         345   orbit maquette vs regard, pan camera-space
      InspectorPeek.tsx    343   barre sélection compacte
      ArView.tsx           396   WebXR / Quick Look USDZ
      ViewBar.tsx          130   3D/Plan/Visite/Coupe/AR + strip étages
      ToolDock.tsx         111   Éditer / Esquisse / Tracer / Ouvrage / Objets
      LibraryStrip.tsx     124   catalogue (groupes dont Noyau)
      NavPad.tsx           100   cube N/E/S/O
      InspectorDock.tsx     46   panneau bas 46 dvh
      scene/                     VIDE — reliquat, ne pas remplir sans raison
  lib/
    store/project-store.ts 887   unique store runtime
    bim/
      types.ts             601   Project, Wall, Opening, Room, Furniture, Story, Meta
      seed.ts              595   5 projets démo + projectFromAiDraft
      builder.ts           311   emptyProject, addRectRooms, openings, roofs
      catalog.ts           246   OBJECT_CATALOG + presets murs/baies/dalles/toits
      geometry.ts          219   dist, polygons, wallSolidSegments
      quantities.ts        208   métrés + export JSON/CSV + parse import
      structure.ts         310   porteurs, descentes (heuristique)
      analysis.ts          109   règles métier
      rooms.ts             110   detectLoops
      materials.ts         279   MATERIAL_CATALOG + resolveMaterial
    cad/
      ops.ts               198   copyStory, repeatStories(80), restack, rect, split, heal
      massing.ts           131   generateMassing, insertBasement, nameStories
      dxf.ts                93   export DXF 2D
    render/                      quality, lighting, procedural textures, world-UV shaders
    ai/copilot.ts          132
    physics/rapier-world.ts
    ar/                          device, parts, usdz
    nav/prefs.ts                 orbitMode, invert*, fov
```

Toute feature BIM = **type + builder/ops + rendu 3D + 2D + PropertiesPanel**.

---

## 3. Modèle de données

`Project` (`src/lib/bim/types.ts`) :

```
id, name, createdAt, updatedAt
meta        client, location, lat/lng, north°, brief, plotM2, CES/COS,
            typology, climate H1–H3, energy A–F, seismic, wind, year
stories[]   id, name (SS/RDC/R+n), elevation, height, finishFloor?
walls[]     a,b Vec2, thickness, height, materialId, loadBearing, partition,
            insulationMm, uValue, fireRating, alignment, role, acousticRw,
            exteriorFinish, interiorFinish, baseOffset
openings[]  wallId + t∈[0,1], kind door|window, width, height, sill,
            variant, glazing, swing, shutter, frame, reveal, fire, Rw
rooms[]     polygon, function, floor/wall/ceilingFinish, occupancy, clearHeight, heated
slabs[]     polygon, thickness, outdoor, insulation, liveLoad, structural, finishes
roofs[]     polygon, kind flat|gable|shed|hip, pitch, overhang, gutter, fascia
columns[]   position, width, depth, height, shape rect|round, rotation, structural
stairs[]    origin, direction, width, run, rise, steps, kind straight|spiral, railing
furniture[] kind (~70), position, rotation, w, d, h
materials   Partial<Record<MaterialId, Partial<MaterialStyle>>>
layers / strokes / survey / revisions
```

- Coordonnées **mètres**, plan **XZ** (Y Three = hauteur). Origine typique sud-ouest.
- Nord = `meta.north` (degrés).
- `updatedAt` invalide le 3D (`touch()`). Mutations via `commit` (historique 40) ou `patchNow` (live slider). `beginEdit()` snapshot avant un drag.

**Tools** : select, wall, rect, door, window, room, column, stair, slab, roof, furniture, measure, delete, pen, survey.

**Vues** : `plan | 3d | visite | coupe | ar`.  
**Workspaces** : `esquisse` (plan+pen) · `modele` (3D) · `releve` (plan+survey).  
**Skill** : `simple | pro` — simple cache Coupe/AR et réduit le dock.

**Store persisté** : `projects`, `lighting`, `sunHour`, `skill`, `ortho`, `nav`. Merge par **nom** de seed (renommer un seed casse la resynchro).

---

## 4. UI — ne pas recasser

### Studio overlay (`StudioShell`)

Tout est `absolute` sur un canvas plein écran (`h-dvh`).

- Header : back, nom, Esq/Modèle/Rel, undo/redo, **PARAMS**.
- Canvas : `ViewportGate` (lazy 3D) ou `Plan2D` ou `ArGate`.
- `ViewBar` haut : vues + strip compact `‹ RDC · 1/8 ›` dès que > 5 niveaux.
- `NavPad` (cube) en 3D/coupe.
- `ToolDock` bas — **caché** quand l’inspecteur est ouvert.
- `InspectorDock` bas 46 dvh, 4 onglets, `pointer-events-auto`.
- `InspectorPeek` si sélection et inspecteur fermé.
- Radial **Studio** : Matériaux, Bibliothèque, Structure, Copilote, 4D, Calques, Guide. **Plus** de doublon Niveaux/Params.
- Event `forma-open-nav` → onglet Vue. Event `forma-cam` → `dispatchCam`.

### Inspecteur (`PropertiesPanel`)

Onglets contrôlés `ParamsTab = "ouvrage" | "niveaux" | "projet" | "rendu"`.

- **Ouvrage** : selon sélection (mur / baie / pièce / dalle / toit / poteau / escalier / meuble). Presets, sliders live `onInput` + `patchNow`, commit au `pointerup`. Section *Avancé* (U, Rw, feu, isolation).
- **Étages** : liste + **massing** (Largeur / Profondeur / Étages / HSP → `generateMassing`). Copier, empiler, sous-sol, nommer.
- **Site** : nom, client, lieu, parcelle, CES/COS, nord, climat, sismo, vent, typologie, classe énergie.
- **Vue** : `NavOptions` (maquette/regard, inversions, FOV, damping) + lumière (presets, heure, intensité, ombres).

`Param` doit arrondir à `step` (bug connu : `2.799999952`).

### Tokens (`src/styles.css`)

```
bg #04080c · surface #0a1118 · elevated #121c26
fg #e8f4f2 · muted #7f9399 · accent #6ed0c3 · primary #c8f0e6
classes hud-chip, hud-panel, hud-label, page-grid, led, mark
cibles ≥ 44 px, safe-area, pas de radius « bubble » excessif
```

---

## 5. 3D / perf (état voulu)

`detectQuality()` (`src/lib/render/quality.ts`) :

- `lambert: false`, `simpleProps: false` **toujours**
- DPR `[1, 2]`, antialias on, shadows on
- shadowMap 512 weak / 1024 mobile / 2048 desktop
- texSize 128 weak / 256 sinon, fog + labels on
- ground 220 mobile / 360 desktop
- **Ne pas** recouper ombres / meubles / DPR sans demande explicite

Rendu :

- `MeshStandardMaterial` + textures procédurales canvas, UVs monde **triplanar** (`world-material.ts`) si `texSize >= 96`.
- Géométrie partagée : un `BoxGeometry(1,1,1)` scalé, pas un geo par mur.
- Site : gazon + bordure de parcelle centrée sur le bâtiment (`Ground`).
- Caméra FOV ~58–60 (`nav.fov`, min 56 au merge), `far` et `span` tiennent compte de la **hauteur**.
- Adaptive DPR R3F `performance.min = 0.85`.
- **Interdit** : `ContactShadows` (artefact « mur gris » déjà vu).
- Orbit : `OrbitRig` camera-space pan, double-tap fit, `dispatchCam({ kind: "fit"|"iso"|"top"|"front"|... })`.

Meubles = assemblages box/cyl/sph selon `OBJECT_MESH.style` (`FurnitureMesh` ~230 L). Pas de glTF.

---

## 6. Massing / immeuble

`generateMassing({ width, depth, floors, floorHeight })` :

- plateau RDC + noyau (ascenseur, cage, escalier) + étage type + `repeatStories` + toiture terrasse
- **destructif sur le RDC** (filtre murs/pièces/meubles de `stories[0]`) — confirmer avant, ou « nouveau projet »
- caps : width 8–80, depth 8–60, floors 1–80, HSP 2.4–8
- `insertBasement`, `nameStories` (SS / RDC / R+n)
- Seed **Tour Horizon** (R+8, Lyon, ~2 200 m²)

Catalogue **Noyau** : elevator, staircore, balcony, curtain. Presets mur Rideau 12 / Noyau 30.

`addFurnitureAt` aligne sur le mur le plus proche (rayon 2,4 m) — **peut tordre** un ascenseur dans le noyau. Piste : skip snap pour `site`/`core`.

---

## 7. Catalogue

`OBJECT_CATALOG` ~70 kinds, groupes : Salon, Repas, Nuit, Cuisine, Eau, Bureau, Technique, **Noyau**, Jardin, Site.

Presets :

- murs 12 (cloison 7 → pierre 50, rideau, noyau)
- portes 8, fenêtres 10, dalles 5, toits 6 (flat/gable/shed/hip), escaliers 5
- matériaux 24 (`MaterialId`) + styles PBR (`MATERIAL_CATALOG`)

Seeds : **Villa Calanque**, **Tour Horizon**, **Atelier Voltaire**, **Maison Patio**, **Pavillon Lac**.

---

## 8. Ce qui marche

- CRUD projets, undo/redo 40, import/export JSON BIM, CSV quantités, DXF 2D
- Tracer 2D (snap, grille, ortho, rectangle de murs), 3D select/place
- Copilote : génération JSON + Q&A (fallback local)
- Visite + physique Rapier optionnelle, coupe, AR (WebXR / USDZ selon device)
- Structure heuristique, phasage 4D, calques esquisse, relevé
- PWA (manifest Grok, install banner)
- `tsc` propre

---

## 9. Dette / bugs (prioritaires)

1. ~~`npm test` n’exécute pas `bim.test.ts`~~ — **fait**. `npm run verify` enchaîne
   typage, `bim.test.ts` et les huit smokes ; la CI le lance. Reste à couvrir
   `copyStory` et le merge du persist.
   ⚠️ Sous Windows, `npm test` avale toujours en silence les 197 tests de
   `scripts/` : le glob `'scripts/**/*.test.mjs'` garde ses quotes sous cmd et
   ne correspond à rien. Lancés à la main, 18 échouent — `.grok/skills/`
   absent (hors dépôt), `symlink` interdit sans droits admin, `execFile` non
   échappé sur `C:\Program Files`, et neuf tests de la coque Grok qui
   supposent une app sans marque là où `site.json` porte FORMA. Ce sont des
   tests de plateforme, pas de FORMA : d’où une porte séparée.
2. ~~Sliders float (`2.799999952`)~~ — **fait** (`0ee0a36`). Ce n’était pas le curseur mais le
   champ chiffré de `Param`, qui écrêtait à `min` **à chaque frappe** : taper « 0.32 » dans
   Épaisseur donnait `0,06 | 0,06 | 0,06 | 0,06`, la frappe n’entrait jamais ; « 1200 » dans
   Parcelle donnait 80 200 m². 35 des 52 `Param` étaient dans ce cas. Le point était mangé
   par surcroît : `type="number"` assainit « 0. » en chaîne vide. La frappe vit désormais à
   part de la valeur, l’écrêtage **et** l’arrondi au pas attendent le `blur`/`Enter`.
   Vérifié à la sonde : « 1.10 » dans Exposition donne `1 | 1. | 1.1 | 1.10`, puis
   `exposure = 1,1` dans le modèle.
3. ~~`generateMassing` destructif~~ — **fait**. `MassingLaunch` arme le
   remplacement en deux temps, annonce le décompte exact (`massingImpact`,
   miroir testé des filtres) et propose « Projet neuf ». Au passage, un bug
   plus grave a été corrigé : la fonction supprimait les étages supérieurs
   sans supprimer leur géométrie, laissant des murs et poteaux rattachés à un
   `storyId` disparu — le métré d’un R+6 ramené au RDC annonçait 597 610 €
   au lieu de 83 085, et l’IFC/DXF exportait ces étages fantômes.
4. `repeatStories` clone tout le plateau. R+40 = explosion draw calls. **Instancing / LOD par étage type**, ou plateau allégé (pas de meubles, murs fusionnés).
5. Pas d’IFC, pas de DWG. DXF = lignes 2D. Import CAD réel manquant.
6. Géométrie murs : pas de trim/extend/fillet, pas de murs courbes, pièces surtout rectangulaires (`detectLoops` existe, tracer pièce faible).
7. Meubles procéduraux, pas glTF.
8. Chunk `Viewport3D` ~900 kB (drei). Code-split partiel (`ViewportGate` / `ArGate`).
9. InspectorDock 46 dvh masque le bas du modèle sur iPhone. Piste : drag hauteur, 38 % mobile, colonne droite ≥ 768 px.
10. Persist merge par **nom**. Tour Horizon s’ajoute si le nom est absent.
11. `addFurnitureAt` snap-mur indésirable pour noyau.
12. Auth/PGLite/multiplayer = code mort. Ne pas allumer.
13. Copilote : schéma JSON étroit (peu de kinds, pas de colonnes). Enrichir prompt + Zod.
14. `sunHour` store **et** `lighting.sunHour` (synchronisés, redondants).
15. Dossier `scene/` vide.
16. `BuildingScene` / `project-store` / `PropertiesPanel` trop gros — découper en slices / sous-composants.
17. `parseImportedProject` ad hoc — Zod `Project`.
18. Toiture `hip` cataloguée mais le mesh 3D est surtout gable + plat (`GableRoofMesh`).
19. Pas d’étage type « lié » : modifier R+1 ne propage pas.
20. Noyau vertical : chaque étage a son propre `elevator` furniture, pas un volume continu.
21. **Cinq panneaux compilent sans être montés** (≈ 1 300 lignes) :
    `InspectorPeek`, `LibraryStrip`, `ManipulationBar` (remplacés par
    `CommandOrb` + `ResourcesPeek` en `9fdd940`), `MaterialsPanel` et
    `OuvrageExplorer` (déplacés dans le rail Ressources en `2d1b7c5`).
    Compiler ne prouve rien sur l’atteignabilité : vérifier par recherche de
    références. À supprimer ou à recâbler — décision produit, pas technique.
22. Un ancien fork Vite CAD (`forma` 0.9.1, dépôt git distinct, 2,2 Mo) traîne
    imbriqué dans `archimobile/`, déposé par un script `.bat`. Ignoré par git
    et ESLint ; il contient `geom.ts`, `railings.ts`, `roofs.ts`, `stairs.ts`
    avec leurs tests, absents de FORMA — à trier avant de le jeter.

### Trouvé par l’audit du 11/09, confirmé, **pas encore corrigé**

Chaque point a été reproduit par un auditeur puis confirmé par un sceptique chargé
de le réfuter. Chiffres vérifiés, pas des soupçons.

23. ~~Profil de rendu téléphone bridé~~ — **fait** (`b86ef4e`). DPR 1,35 → 2, antialias
    rendu, texSize 256, ground 220, shadowMap 1024, étiquettes actives. Sur l’application
    réelle, iPhone 17 Pro : tampon 530×1150 → **786×1704, ×2,20 de pixels rendus**.
    `simpleProps` n’est plus forcé à 8 étages — mesuré : un R+40 coûte 296 appels de dessin
    par image, exactement comme un R+8, la fenêtre d’étages borne déjà le coût.
    L’assertion `q8.simpleProps === true` de `cad-export-check` figeait la régression ;
    elle est inversée, avec le chiffre qui la justifie.
24. ~~Un appui annule le panoramique~~ — **fait** (`b86ef4e`). Dérive 10,08 m → **0,00 m**
    aux appuis 1, 2 et 3. On peut enfin cadrer un angle puis sélectionner un mur.
25. ~~Emprise cadastrale en miroir en 3D~~ — **fait** (`7531d0f`). Écart du sommet nord
    45,488 m → **0,000 m**, aire signée de même sens qu’en 2D.
26. ~~Calque de relevé en miroir vertical~~ — **fait** (`7531d0f`). Écart 8,000 m → 0,000 m ;
    sur 24 rotations × 63 pixels, écart max 2,51e-15 m. Deux assertions ajoutées au smoke sur
    l’axe vertical et sur un coin : rejouées contre la convention retournée, **elles échouent**
    — elles ne sont donc pas tautologiques.
27. ~~Bascule Plan → 3D qui tue le contexte WebGL~~ — **fait** (`b424666`). 8 allers-retours :
    8 contextes perdus et 176 programmes recompilés → **0 et 0**, qualité inchangée.
28. **`roofFaces` bbox-ise les toitures non rectangulaires.** `roof-planes.ts:49`
    part de `boundsOf(roof.polygon)` pour tout ce qui n’est pas plat. Depuis que le
    métré suit les pans exportés (commit `2242553`), l’erreur devient visible au
    prix : un toit en L de 120 m² d’emprise compte 216 m² en gable. L’IFC et le DXF
    exportaient déjà cette bbox. C’est le défaut de fond derrière la toiture `hip`
    de la dette 18.
29. **Le relais `/api/rtc` ne libère jamais ses salons.** `signaling.server.ts:83` —
    `roomOf()` crée un salon sur n’importe quel identifiant inconnu, un simple GET
    suffit, et `prune()` ne nettoie que l’intérieur d’un salon qu’une requête vient
    de toucher. 10 000 requêtes anonymes retiennent 327 Mo définitivement. Les TTL
    annoncés (45 s / 60 s) ne s’appliquent à aucun salon abandonné.
30. **Une réponse malformée de la BAN affiche du V8 en anglais.** `api-helpers.ts:14`
    renvoie tel quel tout message d’exception de moins de 180 caractères, et ni
    `ban.ts` ni `cadastre.ts` ne protègent `res.json()`. Une passerelle qui répond
    en HTML suffit à afficher « Cannot read properties of undefined » dans une
    interface française.
31. **Le bouton « Porteur » rouvre l’écart métré/nomenclature.** `PropertiesPanel.tsx:216`
    écrit `commitSelected({ loadBearing: v, partition: !v })` sans toucher `w.role`,
    alors que la clé de groupe de `nomenclature.ts:176` s’appuie sur `role` : 1 100 €
    d’écart sur Villa Calanque après un seul appui, et des murs jamais touchés
    reprisés au tarif du premier de leur groupe.
32. **Trois tests ajoutés le 11/09 sont tautologiques** et passeraient sans leur
    correctif : `quantities-coherence.test.ts:118` (aucune démo n’a de cloison, donc
    l’assertion est vraie dans les deux mondes), l’oracle toiture du même fichier
    (il compare `faceArea3d` à une copie mot pour mot de lui-même), et l’oracle de
    `ifc-roofs.test.ts:221` (il appelle `roofFaces`, la fonction même qu’`exportIfc`
    appelle : il prouve la fidélité à `roofFaces`, jamais à la toiture saisie).
    Un test qui ne peut pas échouer ne protège rien — les réécrire avec un oracle
    indépendant.

---

## 10. Améliorations — ordre suggéré

### A. Modélisation (le plus bloquant)

- Trim / extend / offset de murs, T-jonctions, `healWallEnds` plus robuste
- Murs courbes, polylignes, toiture hip réellement 3D
- Édition d’étage type → propager aux étages liés
- Noyau vertical continu (gaines, ascenseur, cages) aligné
- Grilles structurelles, axes, cotes persistantes
- Snap d’objets core/site **sans** rotation vers le mur

### B. BIM / données

- IFC 2x3/4 export subset (IfcWall, IfcSlab, IfcDoor…)
- Import DXF/JSON plus tolérant
- Pièces : SUN, HSP, finitions par local
- Quantités type DQE (murs m², menuiseries u, dalles m², plinthes ml)

### C. Rendu 3D (enrichir, pas couper)

- Instancing des étages types
- Frustum + occlusion si R+40
- glTF pour 3–4 objets clés (ascenseur, voiture) **sans** baisser le reste
- Éviter ContactShadows

### D. UX

- Dock : drag hauteur ; tablette = colonne droite
- 2D : zoom/pan CAD (molette, space+drag), saisie clavier des cotes
- Undo granulaire pendant slider (`beginEdit` existe — un seul item au pointerup)
- Onboarding court ; NavCoach persisté une fois

### E. Qualité code

- Slices Zustand : project, tools, stories, lighting
- Découper `BuildingScene.tsx` (WallGroup / FurnitureMesh / Roof déjà presque isolés)
- Zod à l’import/persist
- Brancher `bim.test.ts` dans `npm test`

---

## 11. Store — API utile

```
commit(mutator)              historique
patchNow(mutator)            live, pas d’historique
beginEdit()                  snapshot avant drag
patchSelected / commitSelected
addMassing(opts)             → generateMassing
copyStory / repeatStories / addBasement
updateStory / patchStory / addStory / removeStory
setLighting / setNav / setSkill
placeAt(p)                   dispatch outil courant
analysis()                   ProjectAnalysis
```

Invalider le 3D = `touch(project)` (bump `updatedAt`). Le canvas est en `demand` : tout changement visuel doit passer par ça ou `invalidate()`.

---

## 12. Comment vérifier

1. `npm run verify` — doit finir sur **FORMA vert**. `npm run lint` : 0 erreur.
2. Ouvrir **Tour Horizon** : PARAMS → Étages / Vue. Slider HSP / heure → le 3D **bouge en live**, pas de sheet plein écran.
3. Massing 12 × 18 × 8 étages → RDC–R+7, noyau, compact ViewBar.
4. Sur une maquette existante, « Générer » doit d’abord **demander** : le
   décompte annoncé est celui du projet, et « Projet neuf » laisse la maquette
   intacte. Sur un projet vierge, un seul appui.
5. Villa Calanque : orbit maquette, drag = le bâtiment suit le doigt (pas l’inverse).
6. Mode Amateur (`skill=simple`) : pas Coupe/AR, dock réduit.
7. Viewport téléphone 390×844 + safe-area. Vérifier aussi **375** et **320** :
   l’en-tête de l’accueil y débordait. Console 3D attendue **sans**
   avertissement Three (`precision`, `sigmaRadians`).

Ne pas repartir d’un greenfield.

### Revue d’interface du 12/09 — reste ouvert

Cinq zones mesurées dans un vrai Chromium à 320/375/393/430/768 px. Diagnostic :
la densité extrême (90 % du texte ≤ 12 px) devait acheter de l’écran pour la maquette,
et n’achetait rien — le chrome mangeait 25,8 % à 375 px au repos, 49,1 % avec le rail
Ressources ouvert. Le gros est corrigé ; voici ce qui tient encore.

33. **Treize commandes du rail restent sous 44 px.** Le rail empile trois lignes à 4 px
    d’intervalle dans 150 px, et le bandeau bas est figé à 162 px par quatre ancrages en
    dur (`ViewBar`, `NavPad`, `RadialMenu`, `ResourcesPeek`). Deux zones de 44 px
    voisines s’y recouvrent, et celle du bas vole l’appui de celle du haut. Aérer le rail
    demande de toucher `CommandOrb.tsx` et ces quatre décalages ensemble.
34. **L’accent n’est pas unique — décision de design à trancher.** `--color-accent` vaut
    `#7aa89c`, mais 13 occurrences codent `#6ed0c3` en dur (BuildingScene, Plan2D,
    SelectionGizmo, Viewport3D, `__root.tsx`) et 12 codent `#7a9e96`. Le §0.7 en exige un
    seul. Les occurrences 3D sont des couleurs Three, elles ne lisent pas les variables CSS.
35. **Les huit panneaux sont modaux** : `sheet.tsx` pose un overlay `fixed inset-0` sur
    100 % du viewport, et cinq d’entre eux pilotent pourtant la maquette qu’ils cachent.
    `InspectorDock` (162 px, sans overlay, canvas atteignable) prouve que le motif non
    modal fonctionne. La poignée `.sheet-handle` est un `div` sans gestionnaire : ni le
    tap, ni le glissé, ni le tap sur l’overlay ne ferment — seule la croix.
36. **L’anneau de focus est sous 3:1 partout** (`ring-fg/30` = 2,32 à 2,44:1 ;
    `ring-fg/25` = 1,94 à 2,08:1), seuil WCAG SC 1.4.11. Deux langages de focus
    cohabitent : les primitives suppriment l’outline UA, les autres contrôles la gardent.
37. **`Onboarding.tsx` n’est jamais monté** (108 lignes, `shouldOnboard` / `markOnboarded`
    exportés, 0 référence). Aucune prise en main n’existe à l’exécution, et
    `forma-onboarded` reste `null` après la première visite.
38. **L’accueil propose de « Continuer » une démo jamais ouverte.** `last = projects[0]`
    quand `currentId` est nul : le seul bouton plein de l’écran (16 080 px² à 375) invite à
    reprendre Villa Calanque, semée 200 ms plus tôt. Rien ne distingue une démo du travail
    de l’utilisateur — le prédicat existe pourtant déjà (`updatedAt !== createdAt`,
    `project-store.ts`, utilisé par `resetExamples`).
39. **Les trois boutons d’une carte d’archive font 40 px et ne sont pas élargis**, posés
    sur la vignette : 8,9 % des points de la vignette ouvrent une action au lieu du projet,
    et « Supprimer » est le plus proche du bord (9 px), donc le plus atteignable au pouce.
