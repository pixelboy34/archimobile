export function HelpPanel() {
  return (
    <div className="flex flex-col gap-4 text-sm text-muted">
      <p className="text-fg">FORMA est un studio BIM : le plan, le 3D et le métré sont le même modèle.</p>
      <ol className="flex list-decimal flex-col gap-3 pl-4">
        <li>
          <span className="text-fg">Amateur ou Expert.</span> Amateur : 3D guidée, murs et objets.
          Expert : esquisse, relevé, structure, 4D. Basculez en haut à droite.
        </li>
        <li>
          <span className="text-fg">Navigation 3D.</span> Maquette : le bâtiment suit le doigt.
          Cube N·E·S·O pour les façades, ±90° pour pivoter. Params → Vue → Regard si vous visez
          comme une caméra.
        </li>
        <li>
          <span className="text-fg">Bibliothèque.</span> 110 objets : salon, nuit,
          cuisine, eau, bureau, technique, extérieur. Récents en tête. Tapez pour poser.
        </li>
        <li>
          <span className="text-fg">Paramètres.</span> L’essentiel d’abord (géométrie). Avancé
          ouvre thermique, feu, urbanisme. Dupliquez un niveau pour les grands projets.
        </li>
        <li>
          <span className="text-fg">Matières.</span> Studio → Matériaux. Enduit, brique, zinc, marbre,
          parquet — textures monde, peintes en direct.
        </li>
        <li>
          <span className="text-fg">Lumière et chantier.</span> Soleil, ombres, phases 4D, métré HT.
        </li>
        <li>
          <span className="text-fg">IA.</span> Décrivez un programme : FORMA génère un massing habitable.
        </li>
      </ol>
      <p className="text-xs text-muted">
        Raccourcis : Espace dernier outil · W mur · D porte · E fenêtre · T objet · M cote · Tab étage ·
        Maj+clic multi-sélection · Échap · Suppr · Ctrl+Z · Ctrl+D.
      </p>
    </div>
  );
}
