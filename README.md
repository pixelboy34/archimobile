# FORMA

Studio BIM / CAD mobile-first (PWA). UI francaise, rendu 3D PBR, massing multi-etages.

## Lancer

```bash
cd /workspace/forma
npm install
npm run dev
npm run typecheck
npm run build
```

Serveur: http://0.0.0.0:8080

Stack: Vite + React 19 + TypeScript + React Router - Three/R3F/Drei - Zustand (forma-studio-v9) - Tailwind v4

Projets: Villa Calanque, Tour Horizon, Atelier Voltaire, Maison Patio, Pavillon Lac

Pas d'auth.

## Outils recents

- Couper / Prolonger, Objets, Visite (voir ToolDock / Vue Visite).
- Couper: Plan > Couper > mur puis point de coupe (intersection preferree).
- Prolonger: Plan > Prolonger > mur puis mur cible.
- Objets: ToolDock Objets > choisir > cliquer plan ou sol 3D; R=rot90; Ouvrage pour editer.
- Visite: barre Vue > Visite; WASD+souris / joystick mobile; Shift sprint.

## Coupe (Expert)

- Barre Vue > Coupe (mode Expert).
- Plan de coupe horizontal (hauteur, defaut milieu de l etage actif) ou vertical (position X).
- Geometrie au-dela du plan masquee (clipping Three.js) + plan helper cyan.
- Inspecteur / Params restent utilisables pendant la coupe.

## AR (Expert)

- Barre Vue > AR.
- Preferentiellement WebXR (navigator.xr) si le navigateur le declare.
- Sinon camera arriere + overlay maquette (orientation appareil / glisser).
- Modes: Poser (echelle 1:50) et Cote (deux touches = distance approx.).
- iOS: bouton Quick Look USDZ (maquette simplifiee).
- Si la camera est refusee: viewer glisser-pour-regarder + message FR clair.
- Les autres vues (3D / plan / visite / coupe) ne sont pas impactees.

## Export IFC4 (sous-ensemble)

- Bouton IFC dans l en-tete Studio, ou Params > Vue > Livrables > Exporter IFC4.
- Genere un fichier .ifc (ISO-10303-21 / IFC4) telechargeable.
- Entites: IfcProject, IfcSite, IfcBuilding, IfcBuildingStorey, IfcWallStandardCase,
  IfcOpeningElement (si ouvertures), IfcSlab, IfcBuildingElementProxy (mobilier / noyau).
- Unites: metres. Etages FORMA = IfcBuildingStorey (elevation).
- Plan FORMA XZ mappe en IFC XY (Z vertical).

### Limites (pas un export ArchiCAD / Revit complet)

- Geometrie en solides extrudes rectangulaires (pas de B-rep exact, pas de murs courbes).
- Pas de materiaux IFC, quantites, classifications Uniclass, ni proprietes Pset completes.
- Toitures / escaliers / colonnes non exportes dans ce sous-ensemble.
- Ouvertures = void simples (pas de menuiseries detaillees).
- GUIDs regeneres a chaque export (pas de tracking stable entre versions).
- Destine a la coordination legere / echange de volumes, pas au round-trip BIM.
