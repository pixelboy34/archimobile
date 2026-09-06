# FORMA — brief Claude Code

Studio BIM / CAD mobile-first (PWA iPhone + Android), UI française. Plus ambitieux qu’ArchiCAD sur téléphone : tracer, massing immeuble, visite 3D, AR, copilote IA, 4D, quantités.

Ne pas recréer l’app. Elle est jouable. Mission = parfaire géométrie, BIM, perfs d’immeubles, clarté du dock.

## 0. Contraintes (non négociables)

Issues utilisateur répétées — à respecter avant toute « optimisation »:

- Ne jamais dégrader le rendu 3D. PBR, ombres PCF, meubles composés, parcelle large, DPR jusqu’à 2. Un passage « perf » a déjà cassé la qualité ; l’utilisateur a exigé l’inverse (enrichir, pas diminuer).
- Paramètres vivants. Le modèle 3D reste visible pendant qu’on règle. Interdit : Sheet / Dialog plein écran pour les params. Utiliser InspectorDock (~46 dvh, bas).
- Menus groupés. 4 onglets inspecteur : Ouvrage | Étages | Site | Vue. Studio (radial) : Matériaux, Bibliothèque, Structure, Copilote, 4D, Calques, Guide.
- Immeubles. Massing R+n, noyau, rideau, sous-sol, `repeatStories` jusqu’à 80. Pas seulement des villas.
- Orbit maquette = grab the model (`theta -= dx`). Sens non inversé. `regard` existe mais n’est pas le défaut.
- PWA installable (iPhone 17 Pro). Ne pas casser `grokPwaPlugin`, `public/__grok/`.
- UI française, tons sombres, accent cyan `#6ed0c3`, pas d’emoji.
- Auth / Postgres OFF. Zustand persist `forma-studio-v9`. Ne pas allumer Better Auth.

## 1. Stack & commandes

| Couche | Choix |
|---|---|
| App | TanStack Start + React 19 + Vite 8 + TypeScript |
| Style | Tailwind v4, tokens `src/styles.css`, Syne / Outfit / IBM Plex Mono |
| 3D | Three 0.185 + R3F 9 + drei, `frameloop="demand"` (sauf visite) |
| Physique | Rapier — collision visite, optionnelle |
| État | Zustand v5 persist `forma-studio-v9` |
| BIM | modèle maison (pas de moteur IFC) |
| IA | `src/lib/ai/copilot.ts` → `api.x.ai` si `XAI_API_KEY`, sinon massing local |

```bash
npm run dev          # 0.0.0.0:8080 — JAMAIS vite direct
npm run typecheck    # tsc --noEmit
node --experimental-strip-types --test src/lib/bim/bim.test.ts
```

Routes : `/` (`HomePage`) · `/studio/$projectId` (`StudioShell`).

## 2. Carte du code

```text
src/components/studio/
  StudioShell.tsx      495   chrome overlay
  BuildingScene.tsx   1064   murs / dalles / toits / meubles   ← GROS
  PropertiesPanel.tsx  614   4 onglets inspecteur
  Plan2D.tsx           574   SVG 2D
  Viewport3D.tsx       463   Canvas R3F
  OrbitRig.tsx         345   orbit maquette vs regard
  ArView.tsx           396   WebXR / USDZ
  InspectorDock.tsx     46   panneau bas 46 dvh
  scene/                     VIDE — reliquat

src/lib/
  store/project-store.ts 887   unique store
  bim/types.ts           601
  bim/seed.ts            595   5 démos + IA draft
  bim/builder.ts         311
  bim/catalog.ts         246
  bim/structure.ts       310
  cad/ops.ts             198   copyStory, repeatStories(80)
  cad/massing.ts         131   generateMassing, insertBasement
  render/                      quality, lighting, shaders monde
```

Toute feature BIM = type + builder/ops + rendu 3D + 2D + `PropertiesPanel`.

## 3. Modèle

`Project` : `stories[]`, `walls[]` (a/b Vec2 mètres), `openings[]` (liés `wallId` + `t 0–1`), `rooms[]`, `slabs[]`, `roofs[]`, `columns[]`, `stairs[]`, `furniture[]` (~70 kinds), materials overrides, sketch/survey/revisions, meta (parcelle, CES/COS, climat, sismo, typologie).

Plan XZ, Y = hauteur. Nord = `meta.north` (°).

Mutations : `commit` (historique 40) ou `patchNow` (live slider) + `touch()` pour invalider le 3D (`updatedAt`). `beginEdit()` avant un drag.

Vues : `plan | 3d | visite | coupe | ar`. Workspaces : `esquisse · modele · releve`. Skill : `simple | pro`.

## 4. UI à ne pas recasser

- Canvas plein écran, chrome absolute, `InspectorDock` bas, 3D visible au-dessus.
- Header PARAMS ; peek sur sélection ; `ViewBar ‹ RDC · 1/8 ›` si > 5 niveaux.
- `ToolDock` caché quand l’inspecteur est ouvert.
- Onglet Étages = liste + massing (Largeur / Profondeur / Étages / HSP → `generateMassing`).
- Tokens : bg `#04080c`, accent `#6ed0c3`, cibles ≥ 44 px, safe-area.

## 5. 3D (état voulu)

`detectQuality()` : `lambert: false`, `simpleProps: false`, DPR 2, ombres on, tex 256, ground 220–360. Ne pas recouper.

PBR + textures procédurales, UVs monde triplanar. Geo partagée (`BoxGeometry` scalé). Interdit : `ContactShadows` (artefact mur gris). Orbit maquette, pan camera-space, `dispatchCam`.

## 6. Massing

`generateMassing({ width, depth, floors, floorHeight })` : plateau + noyau + étage type + stack + terrasse. Destructif sur le RDC — confirmer. Caps 80 étages. Seed Tour Horizon (R+8, Lyon).

Catalogue Noyau : `elevator`, `staircore`, `balcony`, `curtain`.

## 7. Ce qui marche

CRUD, undo/redo, JSON/CSV/DXF, tracer 2D/3D, ~70 objets, ~24 matériaux, copilote, visite+Rapier, coupe, AR, structure heuristique, 4D, PWA, tsc propre.

Seeds : Villa Calanque, Tour Horizon, Atelier Voltaire, Maison Patio, Pavillon Lac.

## 8. Dette prioritaire

- Brancher `bim.test.ts` dans `npm test` + tests massing/copyStory.
- Sliders float (`2.799999952`) — arrondir à step.
- Massing destructif → confirmation.
- `repeatStories` clone tout → explosion draw calls R+40. Instancing / LOD étage type.
- Pas d’IFC / DWG. DXF = lignes 2D.
- Pas de trim/extend/fillet, pas de murs courbes, hip 3D incomplet.
- Dock 46 dvh masque le bas du modèle iPhone → drag hauteur / colonne tablette.
- Persist merge par nom de seed.
- `addFurnitureAt` snap-mur tord le noyau (ascenseur).
- Copilote schéma JSON trop étroit. Zod à l’import.
- Gros fichiers à découper (`BuildingScene`, store, `PropertiesPanel`).
- Pas d’étage type lié (modifier R+1 ne propage pas). Noyau non continu verticalement.

## 9. Ordre de travail suggéré

A. Modélisation — trim/extend, T-jonctions, murs courbes, hip 3D, étage type lié, noyau continu, grilles.

B. BIM — IFC subset, DQE, SUN/HSP par pièce.

C. Rendu — instancing étages, frustum R+40, 3–4 glTF clés sans baisser le reste.

D. UX — dock redimensionnable, 2D type CAD, undo slider granulaire.

E. Code — slices Zustand, Zod Project, tests massing.

## 10. Vérifier après chaque patch

```bash
npx tsc --noEmit
```

- Tour Horizon → PARAMS Étages/Vue : sliders live, 3D visible.
- Massing 12×18×8 → RDC–R+7 + noyau + ViewBar compact.
- Villa Calanque : drag orbit = le bâtiment suit le doigt.
- Amateur : pas Coupe/AR.
- Viewport 390×844 + safe-area.

Pour Claude Code : coller `CLAUDE.md` à la racine, lire `types.ts` → `project-store.ts` → `StudioShell.tsx` → `BuildingScene.tsx`, puis attaquer A (modélisation) avant toute cosmétique.
