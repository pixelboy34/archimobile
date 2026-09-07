export type TextureKind =
  | "smooth"
  | "plaster"
  | "concrete"
  | "wood"
  | "brick"
  | "stone"
  | "terracotta"
  | "metal"
  | "water"
  | "vegetation"
  | "glass";

export interface MaterialStyle {
  color: string;
  roughness: number;
  metalness: number;
  opacity: number;
  transparent: boolean;
  texture: TextureKind;
  scale: number;
}

export type MaterialStyles = Partial<Record<MaterialId, Partial<MaterialStyle>>>;

export type Vec2 = { x: number; y: number };

export type MaterialId =
  | "plaster"
  | "concrete"
  | "wood"
  | "glass"
  | "brick"
  | "metal"
  | "terracotta"
  | "stone"
  | "water"
  | "vegetation"
  | "darkwood"
  | "white"
  | "marble"
  | "zinc"
  | "parquet"
  | "lime"
  | "corten"
  | "copper"
  | "slate"
  | "gravel"
  | "clt"
  | "polycarb"
  | "travertine"
  | "stucco";

export type RoomFunction =
  | "living"
  | "kitchen"
  | "bedroom"
  | "bath"
  | "wc"
  | "entry"
  | "corridor"
  | "office"
  | "dining"
  | "storage"
  | "laundry"
  | "terrace"
  | "patio"
  | "garage"
  | "studio"
  | "dressing"
  | "cellar"
  | "gym"
  | "other";

export type FurnitureKind =
  | "sofa"
  | "armchair"
  | "chair"
  | "table"
  | "coffee"
  | "ottoman"
  | "sideboard"
  | "rug"
  | "fireplace"
  | "piano"
  | "bed"
  | "nightstand"
  | "dresser"
  | "wardrobe"
  | "shelf"
  | "bookshelf"
  | "kitchen"
  | "counter"
  | "island"
  | "desk"
  | "fridge"
  | "stove"
  | "oven"
  | "sink"
  | "dishwasher"
  | "hood"
  | "bath"
  | "toilet"
  | "shower"
  | "basin"
  | "bidet"
  | "washer"
  | "lamp"
  | "tv"
  | "radiator"
  | "ac"
  | "solar"
  | "chimney"
  | "skylight"
  | "plant"
  | "tree"
  | "hedge"
  | "fence"
  | "pergola"
  | "bench"
  | "barbecue"
  | "umbrella"
  | "lamppost"
  | "gate"
  | "planter"
  | "car"
  | "bike"
  | "parking"
  | "pool"
  | "people"
  | "kingbed"
  | "crib"
  | "console"
  | "millwork"
  | "officechair"
  | "dryer"
  | "freezer"
  | "microwave"
  | "evcharger"
  | "jacuzzi"
  | "mailbox"
  | "printer"
  | "olive"
  | "cypress"
  | "fountain"
  | "firepit"
  | "elevator"
  | "staircore"
  | "balcony"
  | "curtain"
  | "cornersofa"
  | "loveseat"
  | "tvbench"
  | "speaker"
  | "artwork"
  | "roundtable"
  | "stool"
  | "hightable"
  | "bunk"
  | "mirror"
  | "pantry"
  | "winefridge"
  | "trashbin"
  | "towelrail"
  | "wcwall"
  | "doublebasin"
  | "meeting"
  | "reception"
  | "locker"
  | "vmc"
  | "panelboard"
  | "boiler"
  | "heatpump"
  | "tank"
  | "ramp"
  | "railing"
  | "canopy"
  | "deck"
  | "claustra"
  | "compost"
  | "dumpster"
  | "truck"
  | "child"
  | "container"
  | "bikeshade"
  | "sofabed"
  | "diningbench"
  | "wallcab"
  | "coat"
  | "outdoortable"
  | "bollard"
  | "vanity"
  | "linen";

export type Tool =
  | "select"
  | "wall"
  | "door"
  | "window"
  | "slab"
  | "roof"
  | "column"
  | "stair"
  | "room"
  | "furniture"
  | "measure"
  | "delete"
  | "pen"
  | "survey"
  | "rect";

export type ViewMode = "plan" | "3d" | "visite" | "coupe" | "ar";
export type WorkspaceMode = "esquisse" | "modele" | "releve";

export type FireRating = "none" | "EI30" | "EI60" | "EI90" | "EI120";
export type WallAlign = "center" | "interior" | "exterior";
export type WallRole = "exterior" | "interior" | "party";
export type OpeningVariant = "single" | "double" | "sliding" | "fixed" | "casement" | "french";
export type Glazing = "single" | "double" | "triple";
export type Swing = "left" | "right";
export type RoofKind = "flat" | "gable" | "shed" | "hip" | "multi";
export type ColumnShape = "rect" | "round";
export type StairKind = "straight" | "spiral";
export type Typology = "house" | "villa" | "collective" | "office" | "atelier";
export type EnergyClass = "A" | "B" | "C" | "D" | "E" | "F";
export type SeismicZone = "1" | "2" | "3" | "4" | "5";
export type WindRegion = "1" | "2" | "3" | "4" | "5";
export type ClimateZone = "H1" | "H2" | "H3";

export type StoryRole = "basement" | "ground" | "typical" | "attic";

export interface Story {
  id: string;
  name: string;
  elevation: number;
  height: number;
  finishFloor?: number;
  /** Structural role in the building stack (SS / RDC / type / attique). */
  role?: StoryRole;
  /** Same id = live-linked typical floors (étage type vivant). */
  typicalGroup?: string;
  /** User unlinked this floor — exception inside the typical stack. */
  detached?: boolean;
}

export interface Wall {
  id: string;
  storyId: string;
  a: Vec2;
  b: Vec2;
  thickness: number;
  height: number;
  materialId: MaterialId;
  baseOffset?: number;
  loadBearing?: boolean;
  partition?: boolean;
  insulationMm?: number;
  uValue?: number;
  fireRating?: FireRating;
  alignment?: WallAlign;
  role?: WallRole;
  acousticRw?: number;
  exteriorFinish?: MaterialId;
  interiorFinish?: MaterialId;
}

export interface Opening {
  id: string;
  kind: "door" | "window";
  wallId: string;
  t: number;
  width: number;
  height: number;
  sill: number;
  materialId: MaterialId;
  variant?: OpeningVariant;
  glazing?: Glazing;
  uValue?: number;
  frame?: number;
  fireRating?: FireRating;
  acousticRw?: number;
  shutter?: boolean;
  swing?: Swing;
  reveal?: number;
}

export interface Slab {
  id: string;
  storyId: string;
  polygon: Vec2[];
  thickness: number;
  materialId: MaterialId;
  outdoor?: boolean;
  insulationMm?: number;
  finishId?: MaterialId;
  liveLoad?: number;
  structural?: boolean;
  ceilingFinish?: MaterialId;
}

export interface Roof {
  id: string;
  storyId: string;
  polygon: Vec2[];
  kind: RoofKind;
  /** Primary pitch (degrees). For multi, first strip / default. */
  pitch: number;
  /** Extra pitches for compound/multi roofs (strip gables). */
  pitches?: number[];
  overhang: number;
  thickness: number;
  materialId: MaterialId;
  gutter?: boolean;
  insulationMm?: number;
  fascia?: boolean;
}

export interface Column {
  id: string;
  storyId: string;
  position: Vec2;
  width: number;
  depth: number;
  height: number;
  materialId: MaterialId;
  shape?: ColumnShape;
  rotation?: number;
  structural?: boolean;
}

export interface Stair {
  id: string;
  storyId: string;
  origin: Vec2;
  direction: number;
  width: number;
  run: number;
  rise: number;
  steps: number;
  railing?: boolean;
  kind?: StairKind;
  nosing?: number;
  materialId?: MaterialId;
}

export interface Furniture {
  id: string;
  storyId: string;
  kind: FurnitureKind;
  position: Vec2;
  rotation: number;
  w: number;
  d: number;
  h: number;
}

export interface Room {
  id: string;
  storyId: string;
  name: string;
  function: RoomFunction;
  polygon: Vec2[];
  floorFinish?: MaterialId;
  occupancy?: number;
  wallFinish?: MaterialId;
  ceilingFinish?: MaterialId;
  clearHeight?: number;
  heated?: boolean;
}

export interface ProjectMeta {
  client: string;
  location: string;
  latitude: number;
  longitude: number;
  north: number;
  brief: string;
  altitude?: number;
  typology?: Typology;
  climate?: ClimateZone | string;
  plotM2?: number;
  ces?: number;
  cos?: number;
  energyClass?: EnergyClass;
  year?: number;
  seismic?: SeismicZone;
  wind?: WindRegion;
  /** Cadastre IGN réel (indicatif) */
  parcelle?: import("@/lib/geo/types").ProjectParcelleMeta;
}

export interface Revision {
  id: string;
  at: string;
  note: string;
}

export interface SketchLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
}

export interface Stroke {
  id: string;
  layerId: string;
  storyId: string;
  points: Vec2[];
  width: number;
  color: string;
}

export interface SurveyPoint {
  id: string;
  storyId: string;
  position: Vec2;
  label?: string;
}

/** Photo / plan scanné sous le relevé (hors IFC/DXF). */
export interface SurveyUnderlay {
  storyId: string;
  /** data: URL compressée (préférée) ou blob: (éphémère). */
  src: string;
  opacity: number;
  /** Largeur monde (m) de l’image. */
  scale: number;
  /** Rotation radian (sens trigo, Y nord). */
  rotation: number;
  /** Centre image en coordonnées monde. */
  offset: Vec2;
  naturalWidth?: number;
  naturalHeight?: number;
  /** true si src est un blob: — ne survit pas au refresh. */
  ephemeral?: boolean;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  meta: ProjectMeta;
  stories: Story[];
  walls: Wall[];
  openings: Opening[];
  slabs: Slab[];
  roofs: Roof[];
  columns: Column[];
  stairs: Stair[];
  furniture: Furniture[];
  rooms: Room[];
  materials?: MaterialStyles;
  layers?: SketchLayer[];
  strokes?: Stroke[];
  survey?: SurveyPoint[];
  /** Calque image relevé (photo / plan) — non exporté IFC/DXF. */
  surveyUnderlay?: SurveyUnderlay;
  revisions?: Revision[];
}

export const MATERIAL_LABELS: Record<MaterialId, string> = {
  plaster: "Enduit",
  concrete: "Béton",
  wood: "Bois",
  glass: "Verre",
  brick: "Brique",
  metal: "Métal",
  terracotta: "Terre cuite",
  stone: "Pierre",
  water: "Eau",
  vegetation: "Végétal",
  darkwood: "Chêne foncé",
  white: "Blanc mat",
  marble: "Marbre",
  zinc: "Zinc",
  parquet: "Parquet",
  lime: "Chaux",
  corten: "Corten",
  copper: "Cuivre",
  slate: "Ardoise",
  gravel: "Gravillon",
  clt: "CLT",
  polycarb: "Polycarbonate",
  travertine: "Travertin",
  stucco: "Stuc",
};

export const ROOM_LABELS: Record<RoomFunction, string> = {
  living: "Salon",
  kitchen: "Cuisine",
  bedroom: "Chambre",
  bath: "Salle de bain",
  wc: "WC",
  entry: "Entrée",
  corridor: "Dégagement",
  office: "Bureau",
  dining: "Salle à manger",
  storage: "Rangement",
  laundry: "Buanderie",
  terrace: "Terrasse",
  patio: "Patio",
  garage: "Garage",
  studio: "Atelier",
  dressing: "Dressing",
  cellar: "Cave",
  gym: "Salle sport",
  other: "Pièce",
};

export const FURNITURE_LABELS: Record<FurnitureKind, string> = {
  sofa: "Canapé 3 pl.",
  armchair: "Fauteuil",
  chair: "Chaise",
  table: "Table repas",
  coffee: "Table basse",
  ottoman: "Pouf",
  sideboard: "Enfilade",
  rug: "Tapis",
  fireplace: "Cheminée",
  piano: "Piano",
  bed: "Lit 160",
  nightstand: "Chevet",
  dresser: "Commode",
  wardrobe: "Armoire",
  shelf: "Étagère",
  bookshelf: "Bibliothèque",
  kitchen: "Linéaire cuisine",
  counter: "Plan de travail",
  island: "Îlot",
  desk: "Bureau",
  fridge: "Réfrigérateur",
  stove: "Plaque",
  oven: "Four",
  sink: "Évier",
  dishwasher: "Lave-vaisselle",
  hood: "Hotte",
  bath: "Baignoire",
  toilet: "WC",
  shower: "Douche 90",
  basin: "Lavabo",
  bidet: "Bidet",
  washer: "Lave-linge",
  lamp: "Lampadaire",
  tv: "Téléviseur",
  radiator: "Radiateur",
  ac: "Climatisation",
  solar: "Panneau PV",
  chimney: "Souche",
  skylight: "Velux",
  plant: "Plante",
  tree: "Arbre",
  hedge: "Haie",
  fence: "Clôture",
  pergola: "Pergola",
  bench: "Banc",
  barbecue: "Barbecue",
  umbrella: "Voile d’ombre",
  lamppost: "Candélabre",
  gate: "Portail",
  planter: "Jardinière",
  car: "Voiture",
  bike: "Vélo",
  parking: "Place 5×2,5",
  pool: "Piscine 8×3,5",
  people: "Silhouette",
  kingbed: "Lit 180",
  crib: "Lit bébé",
  console: "Console",
  millwork: "Placard",
  officechair: "Siège bureau",
  dryer: "Sèche-linge",
  freezer: "Congélateur",
  microwave: "Micro-ondes",
  evcharger: "Borne VE",
  jacuzzi: "Jacuzzi",
  mailbox: "Boîte aux lettres",
  printer: "Imprimante",
  olive: "Olivier",
  cypress: "Cyprès",
  fountain: "Fontaine",
  firepit: "Brasero",
  elevator: "Ascenseur",
  staircore: "Cage d’escalier",
  balcony: "Balcon",
  curtain: "Mur rideau",
  cornersofa: "Canapé angle",
  loveseat: "Canapé 2 pl.",
  tvbench: "Meuble TV",
  speaker: "Enceinte",
  artwork: "Tableau",
  roundtable: "Table ronde",
  stool: "Tabouret",
  hightable: "Mange-debout",
  bunk: "Lits superposés",
  mirror: "Miroir",
  pantry: "Cellier",
  winefridge: "Cave à vin",
  trashbin: "Poubelle tri",
  towelrail: "Sèche-serviettes",
  wcwall: "WC suspendu",
  doublebasin: "Double vasque",
  meeting: "Table réunion",
  reception: "Accueil",
  locker: "Casier",
  vmc: "VMC",
  panelboard: "TGBT",
  boiler: "Chaudière",
  heatpump: "PAC",
  tank: "Ballon ECS",
  ramp: "Rampe",
  railing: "Garde-corps",
  canopy: "Auvent",
  deck: "Terrasse bois",
  claustra: "Claustra",
  compost: "Composteur",
  dumpster: "Local poubelles",
  truck: "Camion",
  child: "Aire jeux",
  container: "Conteneur",
  bikeshade: "Abri vélos",
  sofabed: "Banquette-lit",
  diningbench: "Banc repas",
  wallcab: "Meuble haut",
  coat: "Portemanteau",
  outdoortable: "Table jardin",
  bollard: "Borne",
  vanity: "Meuble vasque",
  linen: "Armoire linge",
};

export const TOOL_LABELS: Record<Tool, string> = {
  select: "Sélection",
  wall: "Mur",
  door: "Porte",
  window: "Fenêtre",
  slab: "Dalle",
  roof: "Toiture",
  column: "Poteau",
  stair: "Escalier",
  room: "Pièce",
  furniture: "Objets",
  measure: "Cote",
  delete: "Effacer",
  pen: "Trait",
  survey: "Relevé",
  rect: "Rectangle",
};

export const FIRE_LABELS: Record<FireRating, string> = {
  none: "Sans",
  EI30: "EI 30",
  EI60: "EI 60",
  EI90: "EI 90",
  EI120: "EI 120",
};

export const ALIGN_LABELS: Record<WallAlign, string> = {
  center: "Axe",
  interior: "Nu int.",
  exterior: "Nu ext.",
};

export const ROLE_LABELS: Record<WallRole, string> = {
  exterior: "Façade",
  interior: "Intérieur",
  party: "Mitoyen",
};

export const GLAZING_LABELS: Record<Glazing, string> = {
  single: "Simple",
  double: "Double",
  triple: "Triple",
};

export const SWING_LABELS: Record<Swing, string> = {
  left: "Gauche",
  right: "Droite",
};

export const TYPOLOGY_LABELS: Record<Typology, string> = {
  house: "Maison",
  villa: "Villa",
  collective: "Collectif",
  office: "Tertiaire",
  atelier: "Atelier",
};

export const ENERGY_LABELS: Record<EnergyClass, string> = {
  A: "A",
  B: "B",
  C: "C",
  D: "D",
  E: "E",
  F: "F",
};

export const CLIMATE_LABELS: Record<ClimateZone, string> = {
  H1: "H1 — Nord",
  H2: "H2 — Océan",
  H3: "H3 — Méditerranée",
};

export const SEISMIC_LABELS: Record<SeismicZone, string> = {
  "1": "Très faible",
  "2": "Faible",
  "3": "Modéré",
  "4": "Moyen",
  "5": "Fort",
};

export const WIND_LABELS: Record<WindRegion, string> = {
  "1": "1",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
};
