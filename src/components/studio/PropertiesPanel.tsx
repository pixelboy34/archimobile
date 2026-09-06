import { useEffect, useState, type ReactNode } from "react";
import {
  ALIGN_LABELS,
  CLIMATE_LABELS,
  ENERGY_LABELS,
  FIRE_LABELS,
  FURNITURE_LABELS,
  GLAZING_LABELS,
  MATERIAL_LABELS,
  ROLE_LABELS,
  ROOM_LABELS,
  SEISMIC_LABELS,
  SWING_LABELS,
  TYPOLOGY_LABELS,
  WIND_LABELS,
  type ClimateZone,
  type EnergyClass,
  type FurnitureKind,
  type MaterialId,
  type RoomFunction,
  type SeismicZone,
  type Typology,
  type WindRegion,
} from "@/lib/bim/types";
import {
  DOOR_PRESETS,
  OBJECT_GROUPS,
  OBJECT_SIZES,
  ROOF_PRESETS,
  SLAB_PRESETS,
  STAIR_PRESETS,
  WALL_PRESETS,
  WINDOW_PRESETS,
} from "@/lib/bim/catalog";
import type { ProjectAnalysis } from "@/lib/bim/analysis";
import { wallLength } from "@/lib/bim/geometry";
import { mergeDetectedRooms } from "@/lib/bim/rooms";
import { healWallEnds } from "@/lib/cad/ops";
import { formatMeters } from "@/lib/utils";
import { useStudio } from "@/lib/store/project-store";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { LIGHT_PRESETS, MONTH_LABELS } from "@/lib/render/lighting";
import { MaterialSwatches } from "./MaterialsPanel";
import { NavOptions } from "./NavOptions";

const MATS = Object.keys(MATERIAL_LABELS) as MaterialId[];
const STRUCT_MATS = MATS.filter((m) => !["water", "vegetation"].includes(m));
const ROOM_FNS = Object.keys(ROOM_LABELS) as RoomFunction[];
export type ParamsTab = "ouvrage" | "niveaux" | "projet" | "rendu";

export function PropertiesPanel({
  compact = false,
  tab: tabProp,
  onTab,
}: {
  compact?: boolean;
  tab?: ParamsTab;
  onTab?: (t: ParamsTab) => void;
}) {
  const project = useStudio((s) => s.projects.find((p) => p.id === s.currentId) ?? null);
  const selectedIds = useStudio((s) => s.selectedIds);
  const grid = useStudio((s) => s.grid);
  const snap = useStudio((s) => s.snap);
  const setGrid = useStudio((s) => s.setGrid);
  const setSnap = useStudio((s) => s.setSnap);
  const ortho = useStudio((s) => s.ortho);
  const setOrtho = useStudio((s) => s.setOrtho);
  const lighting = useStudio((s) => s.lighting);
  const setLighting = useStudio((s) => s.setLighting);
  const clipY = useStudio((s) => s.clipY);
  const setClipY = useStudio((s) => s.setClipY);
  const isolateStory = useStudio((s) => s.isolateStory);
  const setIsolateStory = useStudio((s) => s.setIsolateStory);
  const showStructure = useStudio((s) => s.showStructure);
  const setShowStructure = useStudio((s) => s.setShowStructure);
  const analysis = useStudio((s) => s.analysis);
  const beginEdit = useStudio((s) => s.beginEdit);
  const patchSelected = useStudio((s) => s.patchSelected);
  const commitSelected = useStudio((s) => s.commitSelected);
  const deleteSelected = useStudio((s) => s.deleteSelected);
  const duplicateSelected = useStudio((s) => s.duplicateSelected);
  const renameCurrent = useStudio((s) => s.renameCurrent);
  const patchMeta = useStudio((s) => s.patchMeta);
  const activeMaterialId = useStudio((s) => s.activeMaterialId);
  const setActiveMaterial = useStudio((s) => s.setActiveMaterial);
  const applyMaterial = useStudio((s) => s.applyMaterial);
  if (!project) return null;
  const id = selectedIds[0];
  const wall = project.walls.find((w) => w.id === id);
  const room = project.rooms.find((r) => r.id === id);
  const furn = project.furniture.find((f) => f.id === id);
  const opening = project.openings.find((o) => o.id === id);
  const column = project.columns.find((c) => c.id === id);
  const stair = project.stairs.find((st) => st.id === id);
  const slab = project.slabs.find((s) => s.id === id);
  const roof = project.roofs.find((r) => r.id === id);
  const hasEl = Boolean(id);
  const [tabLocal, setTabLocal] = useState<ParamsTab>(hasEl ? "ouvrage" : "niveaux");
  const tab = tabProp ?? tabLocal;
  const setTab = onTab ?? setTabLocal;
  useEffect(() => {
    if (tabProp) return;
    if (hasEl) setTabLocal("ouvrage");
  }, [hasEl, tabProp]);

  return (
    <div className="flex flex-col gap-5">
      {!compact && !tabProp && (
        <div className="flex gap-1 overflow-x-auto">
          {(
            [
              ["ouvrage", "Ouvrage"],
              ["niveaux", "Étages"],
              ["projet", "Site"],
              ["rendu", "Vue"],
            ] as const
          ).map(([idTab, label]) => (
            <button
              key={idTab}
              type="button"
              onClick={() => setTab(idTab)}
              className={`h-10 shrink-0 px-3.5 text-xs font-medium tracking-wide ${
                tab === idTab ? "bg-primary text-primary-fg" : "bg-elevated text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {(compact || tab === "ouvrage") && (
        <>
          {wall && (
            <Section title="Mur">
              <Row k="Longueur" v={formatMeters(wallLength(wall))} />
              <Group title="Typologie">
                <div className="flex flex-wrap gap-1.5">
                  {WALL_PRESETS.map((pr) => (
                    <button
                      key={pr.id}
                      type="button"
                      onClick={() =>
                        commitSelected({
                          thickness: pr.thickness,
                          partition: pr.partition,
                          loadBearing: pr.loadBearing,
                          insulationMm: pr.insulationMm,
                          uValue: pr.uValue,
                          fireRating: pr.fireRating,
                          alignment: pr.alignment,
                          role: pr.role,
                          acousticRw: pr.acousticRw,
                        })
                      }
                      className="h-9 bg-elevated px-2.5 text-xs"
                    >
                      {pr.label}
                    </button>
                  ))}
                </div>
              </Group>
              <Param label="Épaisseur" value={wall.thickness} min={0.06} max={0.8} step={0.01} onBegin={beginEdit} onChange={(v) => patchSelected({ thickness: v })} />
              <Param label="Hauteur" value={wall.height} min={1} max={12} step={0.05} onBegin={beginEdit} onChange={(v) => patchSelected({ height: v })} />
              <Chips label="Matériau" value={wall.materialId} options={STRUCT_MATS} labels={MATERIAL_LABELS} onChange={(m) => commitSelected({ materialId: m })} />
              <Chips label="Rôle" value={wall.role ?? "interior"} options={Object.keys(ROLE_LABELS)} labels={ROLE_LABELS} onChange={(m) => commitSelected({ role: m })} />
              <ToggleRow label="Porteur" on={Boolean(wall.loadBearing)} onChange={(v) => commitSelected({ loadBearing: v, partition: !v })} />
              <More>
                <Chips label="Alignement" value={wall.alignment ?? "center"} options={Object.keys(ALIGN_LABELS)} labels={ALIGN_LABELS} onChange={(m) => commitSelected({ alignment: m })} />
                <Param label="Isolation" value={wall.insulationMm ?? 0} min={0} max={300} step={5} unit="mm" digits={0} onBegin={beginEdit} onChange={(v) => patchSelected({ insulationMm: v })} />
                <Chips label="Feu" value={wall.fireRating ?? "none"} options={Object.keys(FIRE_LABELS)} labels={FIRE_LABELS} onChange={(m) => commitSelected({ fireRating: m })} />
              </More>
            </Section>
          )}
          {opening && (
            <Section title={opening.kind === "door" ? "Porte" : "Fenêtre"}>
              <div className="flex flex-wrap gap-1.5">
                {(opening.kind === "door" ? DOOR_PRESETS : WINDOW_PRESETS).map((pr) => (
                  <button
                    key={pr.id}
                    type="button"
                    onClick={() => commitSelected({ width: pr.width, height: pr.height, sill: pr.sill, variant: pr.variant })}
                    className="h-9 bg-elevated px-2.5 text-xs"
                  >
                    {pr.label}
                  </button>
                ))}
              </div>
              <Param label="Largeur" value={opening.width} min={0.4} max={6} step={0.05} onBegin={beginEdit} onChange={(v) => patchSelected({ width: v })} />
              <Param label="Hauteur" value={opening.height} min={0.4} max={4} step={0.05} onBegin={beginEdit} onChange={(v) => patchSelected({ height: v })} />
              <Param label="Allège" value={opening.sill} min={0} max={2.4} step={0.05} onBegin={beginEdit} onChange={(v) => patchSelected({ sill: v })} />
              {opening.kind === "window" && (
                <Chips label="Vitrage" value={opening.glazing ?? "double"} options={Object.keys(GLAZING_LABELS)} labels={GLAZING_LABELS} onChange={(m) => commitSelected({ glazing: m })} />
              )}
              {opening.kind === "door" && (
                <Chips label="Sens" value={opening.swing ?? "left"} options={Object.keys(SWING_LABELS)} labels={SWING_LABELS} onChange={(m) => commitSelected({ swing: m })} />
              )}
            </Section>
          )}
          {room && (
            <Section title="Pièce">
              <Field label="Nom">
                <Input value={room.name} onFocus={beginEdit} onChange={(e) => patchSelected({ name: e.target.value })} />
              </Field>
              <Chips label="Fonction" value={room.function} options={ROOM_FNS} labels={ROOM_LABELS} onChange={(m) => commitSelected({ function: m })} />
              <Chips
                label="Sol"
                value={(room.floorFinish ?? "parquet") as MaterialId}
                options={STRUCT_MATS}
                labels={MATERIAL_LABELS}
                onChange={(m) => commitSelected({ floorFinish: m })}
              />
            </Section>
          )}
          {furn && (
            <Section title={FURNITURE_LABELS[furn.kind] ?? "Objet"}>
              <div className="flex flex-wrap gap-1.5">
                {OBJECT_GROUPS.flatMap((g) => g.kinds)
                  .slice(0, 24)
                  .map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => commitSelected({ kind: k, ...OBJECT_SIZES[k] })}
                      className={`h-9 px-2.5 text-xs ${furn.kind === k ? "bg-primary text-primary-fg" : "bg-elevated"}`}
                    >
                      {FURNITURE_LABELS[k as FurnitureKind]}
                    </button>
                  ))}
              </div>
              <Param label="Largeur" value={furn.w} min={0.1} max={12} step={0.05} onBegin={beginEdit} onChange={(v) => patchSelected({ w: v })} />
              <Param label="Profondeur" value={furn.d} min={0.1} max={12} step={0.05} onBegin={beginEdit} onChange={(v) => patchSelected({ d: v })} />
              <Param label="Hauteur" value={furn.h} min={0.02} max={8} step={0.05} onBegin={beginEdit} onChange={(v) => patchSelected({ h: v })} />
              <Param label="Rotation" value={(furn.rotation * 180) / Math.PI} min={0} max={360} step={5} unit="°" digits={0} onBegin={beginEdit} onChange={(v) => patchSelected({ rotation: (v * Math.PI) / 180 })} />
            </Section>
          )}
          {column && (
            <Section title="Poteau">
              <Param label="Section X" value={column.width} min={0.1} max={1.2} step={0.02} onBegin={beginEdit} onChange={(v) => patchSelected({ width: v })} />
              <Param label="Section Y" value={column.depth} min={0.1} max={1.2} step={0.02} onBegin={beginEdit} onChange={(v) => patchSelected({ depth: v })} />
              <Param label="Hauteur" value={column.height} min={1} max={12} step={0.05} onBegin={beginEdit} onChange={(v) => patchSelected({ height: v })} />
              <Chips label="Matériau" value={column.materialId} options={STRUCT_MATS} labels={MATERIAL_LABELS} onChange={(m) => commitSelected({ materialId: m })} />
            </Section>
          )}
          {stair && (
            <Section title="Escalier">
              <div className="flex flex-wrap gap-1.5">
                {STAIR_PRESETS.map((pr) => (
                  <button key={pr.id} type="button" onClick={() => commitSelected({ width: pr.width, steps: pr.steps })} className="h-9 bg-elevated px-2.5 text-xs">
                    {pr.label}
                  </button>
                ))}
              </div>
              <Param label="Largeur" value={stair.width} min={0.7} max={2.4} step={0.05} onBegin={beginEdit} onChange={(v) => patchSelected({ width: v })} />
              <Param label="Giron total" value={stair.run} min={1.5} max={12} step={0.05} onBegin={beginEdit} onChange={(v) => patchSelected({ run: v })} />
              <Param label="Hauteur" value={stair.rise} min={2} max={6} step={0.05} onBegin={beginEdit} onChange={(v) => patchSelected({ rise: v })} />
            </Section>
          )}
          {slab && (
            <Section title="Dalle">
              <div className="flex flex-wrap gap-1.5">
                {SLAB_PRESETS.map((pr) => (
                  <button key={pr.id} type="button" onClick={() => commitSelected({ thickness: pr.thickness })} className="h-9 bg-elevated px-2.5 text-xs">
                    {pr.label}
                  </button>
                ))}
              </div>
              <Param label="Épaisseur" value={slab.thickness} min={0.08} max={0.5} step={0.01} onBegin={beginEdit} onChange={(v) => patchSelected({ thickness: v })} />
              <Chips label="Matériau" value={slab.materialId} options={STRUCT_MATS} labels={MATERIAL_LABELS} onChange={(m) => commitSelected({ materialId: m })} />
            </Section>
          )}
          {roof && (
            <Section title="Toiture">
              <div className="flex flex-wrap gap-1.5">
                {ROOF_PRESETS.map((pr) => (
                  <button key={pr.id} type="button" onClick={() => commitSelected({ pitch: pr.pitch, kind: pr.kind, overhang: pr.overhang })} className="h-9 bg-elevated px-2.5 text-xs">
                    {pr.label}
                  </button>
                ))}
              </div>
              <Param label="Pente" value={roof.pitch} min={0} max={55} step={1} unit="°" digits={0} onBegin={beginEdit} onChange={(v) => patchSelected({ pitch: v })} />
              <Param label="Débord" value={roof.overhang} min={0} max={1.5} step={0.05} onBegin={beginEdit} onChange={(v) => patchSelected({ overhang: v })} />
              <Chips label="Matériau" value={roof.materialId} options={STRUCT_MATS} labels={MATERIAL_LABELS} onChange={(m) => commitSelected({ materialId: m })} />
            </Section>
          )}
          {id && (
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={duplicateSelected}>
                Dupliquer
              </Button>
              <Button variant="danger" className="flex-1" onClick={deleteSelected}>
                Supprimer
              </Button>
            </div>
          )}
          {!id && !compact && (
            <p className="text-sm text-muted">Touchez un mur, une pièce ou un objet — ou passez à Étages pour un immeuble.</p>
          )}
        </>
      )}

      {!compact && tab === "projet" && (
        <>
          <Section title="Projet">
            <Field label="Nom">
              <Input value={project.name} onChange={(e) => renameCurrent(e.target.value)} />
            </Field>
            <Field label="Lieu">
              <Input value={project.meta.location} onFocus={beginEdit} onChange={(e) => patchMeta({ location: e.target.value })} />
            </Field>
            <Param label="Latitude" value={project.meta.latitude} min={-45} max={65} step={0.5} unit="°" digits={1} onBegin={beginEdit} onChange={(v) => patchMeta({ latitude: v })} />
            <Param label="Nord" value={project.meta.north} min={0} max={360} step={5} unit="°" digits={0} onBegin={beginEdit} onChange={(v) => patchMeta({ north: v })} />
            <Chips label="Typologie" value={project.meta.typology ?? "house"} options={["house", "villa", "collective", "office", "atelier"] as Typology[]} labels={TYPOLOGY_LABELS} onChange={(t) => patchMeta({ typology: t })} />
            <Param label="Parcelle" value={project.meta.plotM2 ?? 0} min={80} max={100000} step={50} unit="m²" digits={0} onBegin={beginEdit} onChange={(v) => patchMeta({ plotM2: v })} />
            <More>
              <Field label="Maître d'ouvrage">
                <Input value={project.meta.client} onFocus={beginEdit} onChange={(e) => patchMeta({ client: e.target.value })} />
              </Field>
              <Chips label="Climat" value={(project.meta.climate as ClimateZone) || "H2"} options={["H1", "H2", "H3"] as ClimateZone[]} labels={CLIMATE_LABELS} onChange={(c) => patchMeta({ climate: c })} />
              <Chips label="Classe énergie" value={project.meta.energyClass ?? "B"} options={["A", "B", "C", "D", "E", "F"] as EnergyClass[]} labels={ENERGY_LABELS} onChange={(c) => patchMeta({ energyClass: c })} />
              <Param label="CES max" value={project.meta.ces ?? 0.4} min={0.1} max={1} step={0.05} unit="" digits={2} onBegin={beginEdit} onChange={(v) => patchMeta({ ces: v })} />
              <Param label="COS max" value={project.meta.cos ?? 0.6} min={0.1} max={8} step={0.05} unit="" digits={2} onBegin={beginEdit} onChange={(v) => patchMeta({ cos: v })} />
              <SiteRatios analysis={analysis()} plot={project.meta.plotM2 ?? 0} cesCap={project.meta.ces ?? 0.4} cosCap={project.meta.cos ?? 0.6} />
              <Chips label="Sismique" value={project.meta.seismic ?? "2"} options={["1", "2", "3", "4", "5"] as SeismicZone[]} labels={SEISMIC_LABELS} onChange={(z) => patchMeta({ seismic: z })} />
              <Chips label="Vent" value={project.meta.wind ?? "2"} options={["1", "2", "3", "4", "5"] as WindRegion[]} labels={WIND_LABELS} onChange={(z) => patchMeta({ wind: z })} />
            </More>
          </Section>
          <Section title="Saisie">
            <ToggleRow label="Grille" on={grid} onChange={setGrid} />
            <ToggleRow label="Accrochage" on={snap} onChange={setSnap} />
            <ToggleRow label="Ortho" on={ortho} onChange={setOrtho} />
          </Section>
          <Section title="Matériaux">
            <MaterialSwatches
              value={activeMaterialId}
              onChange={(id) => {
                setActiveMaterial(id);
                applyMaterial(id, selectedIds.length ? "selected" : "walls");
              }}
            />
          </Section>
        </>
      )}

      {!compact && tab === "niveaux" && <StoriesPanel />}

      {!compact && tab === "rendu" && (
        <>
          <Section title="Affichage">
            <ToggleRow label="Grille" on={grid} onChange={setGrid} />
            <ToggleRow label="Accrochage" on={snap} onChange={setSnap} />
            <ToggleRow label="Ortho" on={ortho} onChange={setOrtho} />
            <ToggleRow label="Isoler l’étage" on={isolateStory} onChange={setIsolateStory} />
            <ToggleRow label="Ossature porteuse" on={showStructure} onChange={setShowStructure} />
            <Param label="Coupe (clip Y)" value={clipY} min={0.15} max={1} step={0.02} unit="" digits={2} onBegin={beginEdit} onChange={setClipY} />
            <p className="text-[11px] text-subtle">Passez en vue Coupe pour voir le plan sectionné en direct.</p>
          </Section>
          <Section title="Lumière">
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {LIGHT_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setLighting(p.patch)}
                  className={`h-11 shrink-0 px-3.5 text-xs font-medium ring-1 transition-colors ${
                    Math.abs(lighting.sunHour - (p.patch.sunHour ?? lighting.sunHour)) < 0.01 &&
                    Math.abs(lighting.sunIntensity - (p.patch.sunIntensity ?? lighting.sunIntensity)) < 0.01
                      ? "bg-accent/15 text-accent ring-accent/40"
                      : "bg-elevated text-muted ring-transparent"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Param label="Heure solaire" value={lighting.sunHour} min={5} max={22} step={0.25} unit="h" digits={1} onBegin={beginEdit} onChange={(v) => setLighting({ sunHour: v })} />
            <Param
              label={`Saison · ${MONTH_LABELS[Math.min(11, Math.max(0, Math.round(lighting.month) - 1))]}`}
              value={lighting.month}
              min={1}
              max={12}
              step={1}
              unit=""
              digits={0}
              onBegin={beginEdit}
              onChange={(v) => setLighting({ month: Math.round(v) })}
            />
            <Param label="Soleil" value={lighting.sunIntensity} min={0} max={3} step={0.05} unit="" digits={2} onBegin={beginEdit} onChange={(v) => setLighting({ sunIntensity: v })} />
            <ToggleRow label="Ombres portées" on={lighting.shadows} onChange={(v) => setLighting({ shadows: v })} />
            <Param label="Douceur ombres" value={lighting.shadowSoftness} min={0} max={1} step={0.05} unit="" digits={2} onBegin={beginEdit} onChange={(v) => setLighting({ shadowSoftness: v })} />
            <More>
              <Param label="Ciel" value={lighting.hemi} min={0} max={1.5} step={0.05} unit="" digits={2} onBegin={beginEdit} onChange={(v) => setLighting({ hemi: v })} />
              <Param label="Ambiance" value={lighting.ambient} min={0} max={1.2} step={0.05} unit="" digits={2} onBegin={beginEdit} onChange={(v) => setLighting({ ambient: v })} />
              <Param label="Fill" value={lighting.fill} min={0} max={1.2} step={0.05} unit="" digits={2} onBegin={beginEdit} onChange={(v) => setLighting({ fill: v })} />
              <Param label="Exposition" value={lighting.exposure} min={0.4} max={2} step={0.05} unit="" digits={2} onBegin={beginEdit} onChange={(v) => setLighting({ exposure: v })} />
              <Chips label="Intérieur" value={lighting.interior} options={["off", "auto", "on"]} labels={{ off: "Éteint", auto: "Auto", on: "Allumé" }} onChange={(v) => setLighting({ interior: v as "off" | "auto" | "on" })} />
            </More>
          </Section>
          <Section title="Navigation 3D">
            <NavOptions />
          </Section>
        </>
      )}
    </div>
  );
}

export function StoriesPanel() {
  const project = useStudio((s) => s.projects.find((p) => p.id === s.currentId) ?? null);
  const storyId = useStudio((s) => s.storyId);
  const setStory = useStudio((s) => s.setStory);
  const beginEdit = useStudio((s) => s.beginEdit);
  const patchStory = useStudio((s) => s.patchStory);
  const addStory = useStudio((s) => s.addStory);
  const copyStory = useStudio((s) => s.copyStory);
  const repeatStories = useStudio((s) => s.repeatStories);
  const removeStory = useStudio((s) => s.removeStory);
  const isolateStory = useStudio((s) => s.isolateStory);
  const setIsolateStory = useStudio((s) => s.setIsolateStory);
  const addBasement = useStudio((s) => s.addBasement);
  const addMassing = useStudio((s) => s.addMassing);
  const commit = useStudio((s) => s.commit);
  const [spanW, setSpanW] = useState(18);
  const [spanD, setSpanD] = useState(16);
  const [floors, setFloors] = useState(8);
  const [hsp, setHsp] = useState(2.8);
  if (!project) return null;
  const active = storyId ?? project.stories[0]?.id;
  const tall = project.stories.reduce((h, st) => h + st.height, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm">
          <span className="font-display font-semibold">{project.stories.length}</span>
          <span className="text-muted"> niveaux</span>
        </p>
        <p className="font-mono text-xs text-muted tabular">{tall.toFixed(1)} m hors sol</p>
      </div>
      <Section title="Volume immeuble">
        <p className="text-xs text-muted">Emprise, noyau, étages types — jusqu’à R+80.</p>
        <Param label="Largeur" value={spanW} min={8} max={60} step={0.5} onBegin={beginEdit} onChange={setSpanW} />
        <Param label="Profondeur" value={spanD} min={8} max={50} step={0.5} onBegin={beginEdit} onChange={setSpanD} />
        <Param label="Étages" value={floors} min={1} max={80} step={1} unit="" digits={0} onBegin={beginEdit} onChange={setFloors} />
        <Param label="HSP courant" value={hsp} min={2.4} max={5} step={0.05} onBegin={beginEdit} onChange={setHsp} />
        <Button onClick={() => addMassing({ width: spanW, depth: spanD, floors, floorHeight: hsp })}>Générer le volume</Button>
      </Section>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => addStory()}>+ Étage</Button>
        <Button variant="outline" onClick={() => copyStory()}>Dupliquer tout</Button>
        <Button variant="outline" onClick={() => addBasement()}>+ Sous-sol</Button>
        <Button variant="outline" onClick={() => repeatStories(1)}>+ Type</Button>
        <Button
          variant="accent"
          onClick={() => {
            if (!active) return;
            commit((p) => {
              p.rooms = mergeDetectedRooms(p, active);
              return p;
            });
            toast.success("Pièces détectées");
          }}
        >
          Détecter pièces
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            if (!active) return;
            commit((p) => healWallEnds(p, active));
            toast.success("Jonctions soignées");
          }}
        >
          Soigner jonctions
        </Button>
      </div>
      <div>
        <p className="mb-2 text-xs tracking-wide text-muted uppercase">Empiler l’étage actif</p>
        <div className="flex flex-wrap gap-1.5">
          {[3, 5, 8, 12, 20, 40].map((n) => (
            <button key={n} type="button" onClick={() => repeatStories(n)} className="h-11 min-w-11 bg-elevated px-3 text-xs font-medium">
              +{n}
            </button>
          ))}
        </div>
      </div>
      <ToggleRow label="Isoler le niveau actif" on={isolateStory} onChange={setIsolateStory} />
      {project.stories.map((st, i) => (
        <div key={st.id} className={`border px-3 py-3 ${st.id === active ? "border-accent/50 bg-elevated" : "border-border"}`}>
          <button type="button" onClick={() => setStory(st.id)} className="mb-3 flex w-full items-center justify-between text-left text-sm font-medium">
            <span>{st.name || (i === 0 ? "RDC" : `R+${i}`)}</span>
            <span className="font-mono text-[11px] text-muted">
              {st.elevation.toFixed(1)} → {(st.elevation + st.height).toFixed(1)} m
            </span>
          </button>
          <Field label="Nom">
            <Input value={st.name} onFocus={beginEdit} onChange={(e) => patchStory(st.id, { name: e.target.value })} />
          </Field>
          <Param label="Hauteur sous plafond" value={st.height} min={2.2} max={12} step={0.05} onBegin={beginEdit} onChange={(v) => patchStory(st.id, { height: v })} />
          {i === 0 && (
            <Param label="Niveau 0" value={st.elevation} min={-12} max={40} step={0.05} onBegin={beginEdit} onChange={(v) => patchStory(st.id, { elevation: v })} />
          )}
          {project.stories.length > 1 && (
            <Button variant="ghost" size="sm" className="mt-2 text-danger" onClick={() => removeStory(st.id)}>
              Retirer ce niveau
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">{title}</p>
        <span className="h-px flex-1 bg-border/80" />
      </div>
      {children}
    </section>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/80 bg-elevated/30 px-3 py-3">
      <p className="text-[11px] font-medium tracking-[0.16em] text-subtle uppercase">{title}</p>
      {children}
    </div>
  );
}

function More({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 items-center justify-between rounded-lg bg-elevated px-3 text-xs tracking-wide text-muted uppercase ring-1 ring-border/60"
      >
        {open ? "Réduire" : "Avancé"}
        <span className="font-mono text-[10px] text-accent">{open ? "−" : "+"}</span>
      </button>
      {open ? children : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] tracking-wide text-muted uppercase">{label}</span>
      {children}
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-md bg-elevated/40 px-2.5 py-2">
      <span className="text-[11px] tracking-wide text-muted uppercase">{k}</span>
      <span className="font-mono text-sm tabular text-accent">{v}</span>
    </div>
  );
}

function SiteRatios({
  analysis: a,
  plot,
  cesCap,
  cosCap,
}: {
  analysis: ProjectAnalysis | null;
  plot: number;
  cesCap: number;
  cosCap: number;
}) {
  if (!a || plot < 1) {
    return <p className="text-[11px] text-subtle">Renseignez la parcelle pour le CES / COS live.</p>;
  }
  const cesOk = a.cesActual <= cesCap + 0.01;
  const cosOk = a.cosActual <= cosCap + 0.01;
  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/70 bg-elevated/25 p-2.5">
      <div>
        <p className="text-[10px] tracking-wide text-muted uppercase">Emprise</p>
        <p className="font-mono text-sm tabular">{a.footprint.toFixed(0)} m²</p>
      </div>
      <div>
        <p className="text-[10px] tracking-wide text-muted uppercase">SDP approx.</p>
        <p className="font-mono text-sm tabular">{a.floorArea.toFixed(0)} m²</p>
      </div>
      <div>
        <p className="text-[10px] tracking-wide text-muted uppercase">CES réel</p>
        <p className={`font-mono text-sm tabular ${cesOk ? "text-accent" : "text-danger"}`}>
          {(a.cesActual * 100).toFixed(0)} %
        </p>
      </div>
      <div>
        <p className="text-[10px] tracking-wide text-muted uppercase">COS réel</p>
        <p className={`font-mono text-sm tabular ${cosOk ? "text-accent" : "text-danger"}`}>
          {a.cosActual.toFixed(2)}
        </p>
      </div>
    </div>
  );
}

function Param({
  label,
  value,
  min,
  max,
  step,
  unit = "m",
  digits = 2,
  onBegin,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  digits?: number;
  onBegin: () => void;
  onChange: (v: number) => void;
}) {
  const n = Number.isFinite(value) ? value : min;
  const clamped = Math.min(max, Math.max(min, n));
  const pct = max > min ? ((clamped - min) / (max - min)) * 100 : 0;
  const apply = (raw: number) => {
    if (!Number.isFinite(raw)) return;
    onChange(Math.min(max, Math.max(min, Number(raw.toFixed(4)))));
  };
  return (
    <label className="flex flex-col gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-medium tracking-wide text-muted uppercase">{label}</span>
        <span className="flex items-center gap-1">
          <input
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={step}
            value={Number(n.toFixed(digits))}
            aria-label={label}
            onFocus={onBegin}
            onChange={(e) => apply(Number(e.target.value))}
            className="h-9 w-[4.75rem] rounded-md border border-border bg-elevated px-2 text-right font-mono text-sm tabular focus:border-accent/50 focus:outline-none"
          />
          {unit ? (
            <span className="min-w-[1.6rem] rounded bg-accent/10 px-1.5 py-0.5 text-center text-[10px] font-semibold tracking-wide text-accent uppercase">
              {unit}
            </span>
          ) : null}
        </span>
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Diminuer"
          className="flex size-11 shrink-0 items-center justify-center rounded-md bg-elevated text-lg ring-1 ring-border/50 active:bg-accent/15"
          onPointerDown={onBegin}
          onClick={() => apply(n - step)}
        >
          −
        </button>
        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-border/70" />
          <div
            className="pointer-events-none absolute top-1/2 left-0 h-1.5 -translate-y-1/2 rounded-full bg-accent/70"
            style={{ width: `${pct}%` }}
          />
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={clamped}
            aria-label={label}
            onPointerDown={(e) => {
              e.stopPropagation();
              onBegin();
              (e.currentTarget as HTMLInputElement).setPointerCapture?.(e.pointerId);
            }}
            onInput={(e) => apply(Number((e.currentTarget as HTMLInputElement).value))}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onChange={(e) => apply(Number(e.target.value))}
            className="relative h-11 w-full cursor-pointer appearance-none bg-transparent accent-accent [touch-action:none]"
          />
        </div>
        <button
          type="button"
          aria-label="Augmenter"
          className="flex size-11 shrink-0 items-center justify-center rounded-md bg-elevated text-lg ring-1 ring-border/50 active:bg-accent/15"
          onPointerDown={onBegin}
          onClick={() => apply(n + step)}
        >
          +
        </button>
      </div>
    </label>
  );
}

function Chips<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly string[];
  labels: Record<string, string>;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-medium tracking-wide text-muted uppercase">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m as T)}
            className={`rounded-md px-2.5 py-1.5 text-xs transition-colors ${
              value === m
                ? "bg-primary text-primary-fg ring-2 ring-accent/50"
                : "bg-elevated text-muted ring-1 ring-border/40 hover:text-fg"
            }`}
          >
            {labels[m]}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleRow({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`flex h-11 w-full items-center justify-between rounded-lg px-3 text-sm ring-1 transition-colors ${
        on ? "bg-accent/10 ring-accent/35" : "bg-elevated ring-border/50"
      }`}
    >
      <span>{label}</span>
      <span
        className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide ${
          on ? "bg-accent/20 text-accent" : "bg-border/40 text-muted"
        }`}
      >
        {on ? "ON" : "OFF"}
      </span>
    </button>
  );
}
