# FORMA — passation

Le brief opérationnel pour Claude Code est **`CLAUDE.md`** (racine). Le relire en entier avant de coder.

Résumé une page :

- Produit : PWA BIM/CAD mobile-first, UI française, persist Zustand `forma-studio-v9` (pas d’auth).
- Ne **jamais** dégrader le rendu 3D, ne **jamais** remettre les params en sheet plein écran, orbit **maquette** (grab).
- Gros fichiers : `BuildingScene.tsx` (1064), `project-store.ts` (887), `PropertiesPanel.tsx` (614), `types.ts` (601), `seed.ts` (595), `Plan2D.tsx` (574), `StudioShell.tsx` (495).
- Massing immeuble : `src/lib/cad/massing.ts` + onglet Étages. Caps 80 étages.
- Inspecteur : `InspectorDock` 36→52 dvh (CommandOrb + ResourcesPeek), onglets Ouvrage | Étages | Site | Vue.
- Vérif : `npx tsc --noEmit`, Tour Horizon + Villa Calanque, viewport 390×844.

Ne pas recréer l’app. Parfaire.
