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

Projets: Villa Calanque, Tour Horizon,  Atelier Voltaire, Maison Patio, Pavillon Lac

Pas d'auth.
## Outils recents

- Couper / Prolonger, Objets, Visite (voir ToolDock / Vue Visite).
- Couper: Plan > Couper > mur puis point de coupe (intersection preferree).
- Prolonger: Plan > Prolonger > mur puis mur cible.
- Objets: ToolDock Objets > choisir > cliquer plan ou sol 3D; R=rot90; Ouvrage pour editer.
- Visite: barre Vue > Visite; WASD+souris / joystick mobile; Shift sprint.
