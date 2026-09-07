# FORMA — passation

Le brief opérationnel pour Claude Code est **`CLAUDE.md`** (racine). Le relire en entier avant de coder.

Résumé une page :

- Produit : PWA BIM/CAD mobile-first, UI française, persist Zustand `forma-studio-v9` (pas d’auth). Accent `#6ed0c3`.
- Ne **jamais** dégrader le rendu 3D, ne **jamais** remettre les params en sheet plein écran, orbit **maquette** (grab).
- Collab 2 téléphones : Studio → Livrer → **Collab**. Signalisation in-memory `/api/rtc` (Vite middleware + route TanStack).
- Vérif Collab : PC + téléphone même Wi‑Fi → les deux ouvrent l’URL **Network** (`http://192.168.x.x:8080`, pas localhost) → Créer / Rejoindre un salon (code 6 caractères) → Envoyer maquette.
- Vérif : `npx tsc --noEmit`, Tour Horizon + Villa Calanque, viewport 390×844.

Ne pas recréer l’app. Parfaire.
