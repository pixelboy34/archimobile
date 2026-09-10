/**
 * PARAM_OWNERS — single source of truth for shared toggles (évite les doublons UI) :
 * - Grille / Accrochage / Ortho → CommandOrb (+ raccourcis clavier)
 * - Isoler étage → ViewBar + onglet Étages
 * - Lumière / soleil / ombres → onglet Vue uniquement
 * - Coupe clipY → slider StudioShell (vue coupe) + Param Vue
 * - Ossature → StructurePanel ; Physique → HUD Visite + un toggle Vue
 */
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
  type MaterialId,
  type RoomFunction,
  type SeismicZone,
  type Typology,
  type WindRegion,
  type Project,
} from "@/lib/bim/types";
import {
  DOOR_PRESETS,
  OBJECT_CATALOG,
  OBJECT_SIZES,
  ROOF_PRESETS,
  SLAB_PRESETS,
  STAIR_PRESETS,
  WALL_PRESETS,
  WINDOW_PRESETS,
  objectDef,
} from "@/lib/bim/catalog";
import type { ProjectAnalysis } from "@/lib/bim/analysis";
import {
  CITY_PRESETS,
  VERDICT_LABELS,
  applyCityPresetMeta,
  assessFeasibility,
  type FeasibilityVerdict,
} from "@/lib/bim/feasibility";
import { wallLength } from "@/lib/bim/geometry";
import { mergeDetectedRooms } from "@/lib/bim/rooms";
import { healWallEnds } from "@/lib/cad/ops";
import { massingFootprintHint } from "@/lib/cad/massing";
import { formatMeters } from "@/lib/utils";
import { useStudio } from "@/lib/store/project-store";
import { isLiveTypical, typicalGroupSize } from "@/lib/cad/typical";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { frenchGeoError } from "@/lib/geo/api-helpers";
import { geoSearchAddress, geoParcelleAt } from "@/lib/geo/client";
import {
  CADASTRE_DISCLAIMER,
  formatCadastralRef,
  parcelleToMetaPatch,
} from "@/lib/geo/cadastre";
import type { BanHit } from "@/lib/geo/types";
import { Input } from "@/components/ui/input";
import { LIGHT_PRESETS, MONTH_LABELS } from "@/lib/render/lighting";
import { NavOptions } from "./NavOptions";
import { MassingLaunch } from "./MassingLaunch";

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
  const lighting = useStudio((s) => s.lighting);
  const setLighting = useStudio((s) => s.setLighting);
  const clipY = useStudio((s) => s.clipY);
  const setClipY = useStudio((s) => s.setClipY);
  const physics = useStudio((s) => s.physics);
  const setPhysics = useStudio((s) => s.setPhysics);
  const analysis = useStudio((s) => s.analysis);
  const beginEdit = useStudio((s) => s.beginEdit);
  const patchSelected = useStudio((s) => s.patchSelected);
  const commitSelected = useStudio((s) => s.commitSelected);
  const deleteSelected = useStudio((s) => s.deleteSelected);
  const renameCurrent = useStudio((s) => s.renameCurrent);
  const patchMeta = useStudio((s) => s.patchMeta);
  const id = selectedIds[0];
  const hasEl = Boolean(id);
  // Les deux hooks ci-dessous precedent le garde-fou `!project` : place apres,
  // ils disparaissaient du rendu des que le projet courant devenait nul
  // (suppression du projet, import, reset collab) et React levait
  // « Rendered fewer hooks than expected », ecran blanc sur tout le studio.
  const [tabLocal, setTabLocal] = useState<ParamsTab>(hasEl ? "ouvrage" : "niveaux");
  const tab = tabProp ?? tabLocal;
  const setTab = onTab ?? setTabLocal;
  useEffect(() => {
    if (tabProp) return;
    if (hasEl) setTabLocal("ouvrage");
  }, [hasEl, tabProp]);
  if (!project) return null;
  const wall = project.walls.find((w) => w.id === id);
  const room = project.rooms.find((r) => r.id === id);
  const furn = project.furniture.find((f) => f.id === id);
  const opening = project.openings.find((o) => o.id === id);
  const column = project.columns.find((c) => c.id === id);
  const stair = project.stairs.find((st) => st.id === id);
  const slab = project.slabs.find((s) => s.id === id);
  const roof = project.roofs.find((r) => r.id === id);

  return (
    <div className="flex flex-col gap-2">
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
              <ParamGrid>
              <Param label="Épaisseur" value={wall.thickness} min={0.06} max={0.8} step={0.01} onBegin={beginEdit} onChange={(v) => patchSelected({ thickness: v })} />
              <Param label="Hauteur" value={wall.height} min={1} max={12} step={0.05} onBegin={beginEdit} onChange={(v) => patchSelected({ height: v })} />
              </ParamGrid>
              <div className="flex flex-wrap gap-1">
                {WALL_PRESETS.slice(0, 6).map((pr) => (
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
                    className={`h-8 rounded-md px-2 text-[11px] font-medium ${
                      Math.abs(wall.thickness - pr.thickness) < 0.011 && wall.role === pr.role
                        ? "bg-accent/15 text-accent ring-1 ring-accent/40"
                        : "bg-elevated text-fg/80"
                    }`}
                  >
                    {pr.label}
                  </button>
                ))}
              </div>
              <More label="Typologie">
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
                <Chips label="Matériau" value={wall.materialId} options={STRUCT_MATS} labels={MATERIAL_LABELS} onChange={(m) => commitSelected({ materialId: m })} />
                <Chips label="Rôle" value={wall.role ?? "interior"} options={Object.keys(ROLE_LABELS)} labels={ROLE_LABELS} onChange={(m) => commitSelected({ role: m })} />
                <ToggleRow label="Porteur" on={Boolean(wall.loadBearing)} onChange={(v) => commitSelected({ loadBearing: v, partition: !v })} />
                <Chips label="Alignement" value={wall.alignment ?? "center"} options={Object.keys(ALIGN_LABELS)} labels={ALIGN_LABELS} onChange={(m) => commitSelected({ alignment: m })} />
                <Param label="Isolation" value={wall.insulationMm ?? 0} min={0} max={300} step={5} unit="mm" digits={0} onBegin={beginEdit} onChange={(v) => patchSelected({ insulationMm: v })} />
                <Chips label="Feu" value={wall.fireRating ?? "none"} options={Object.keys(FIRE_LABELS)} labels={FIRE_LABELS} onChange={(m) => commitSelected({ fireRating: m })} />
              </More>
            </Section>
          )}
          {opening && (
            <Section title={opening.kind === "door" ? "Porte" : "Fenêtre"}>
              <ParamGrid>
              <Param label="Largeur" value={opening.width} min={0.4} max={6} step={0.05} onBegin={beginEdit} onChange={(v) => patchSelected({ width: v })} />
              <Param label="Hauteur" value={opening.height} min={0.4} max={4} step={0.05} onBegin={beginEdit} onChange={(v) => patchSelected({ height: v })} />
              </ParamGrid>
              {opening.kind === "window" && (
                <Param label="Allège" value={opening.sill} min={0} max={2.4} step={0.05} onBegin={beginEdit} onChange={(v) => patchSelected({ sill: v })} />
              )}
              <div className="flex flex-wrap gap-1">
                {(opening.kind === "door" ? DOOR_PRESETS : WINDOW_PRESETS).slice(0, 4).map((pr) => (
                  <button
                    key={pr.id}
                    type="button"
                    onClick={() => commitSelected({ width: pr.width, height: pr.height, sill: pr.sill, variant: pr.variant })}
                    className={`h-8 rounded-md px-2 text-[11px] font-medium ${
                      Math.abs(opening.width - pr.width) < 0.06 ? "bg-accent/15 text-accent ring-1 ring-accent/40" : "bg-elevated text-fg/80"
                    }`}
                  >
                    {pr.label}
                  </button>
                ))}
              </div>
              <More label="Type">
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
                {opening.kind === "window" && (
                  <Chips label="Vitrage" value={opening.glazing ?? "double"} options={Object.keys(GLAZING_LABELS)} labels={GLAZING_LABELS} onChange={(m) => commitSelected({ glazing: m })} />
                )}
                {opening.kind === "door" && (
                  <Chips label="Sens" value={opening.swing ?? "left"} options={Object.keys(SWING_LABELS)} labels={SWING_LABELS} onChange={(m) => commitSelected({ swing: m })} />
                )}
                <ToggleRow label="Volet" on={Boolean(opening.shutter)} onChange={(v) => commitSelected({ shutter: v })} />
                <Param label="Position" value={opening.t} min={0.05} max={0.95} step={0.01} unit="" digits={2} onBegin={beginEdit} onChange={(v) => patchSelected({ t: v })} />
                <Param label="Dormant" value={opening.frame ?? 0.06} min={0.03} max={0.16} step={0.005} onBegin={beginEdit} onChange={(v) => patchSelected({ frame: v })} />
                <Param label="Tableau" value={opening.reveal ?? 0} min={0} max={0.4} step={0.01} onBegin={beginEdit} onChange={(v) => patchSelected({ reveal: v })} />
              </More>
            </Section>
          )}
          {room && (
            <Section title="Pièce">
              <Field label="Nom">
                <Input value={room.name} onFocus={beginEdit} onChange={(e) => patchSelected({ name: e.target.value })} />
              </Field>
              <Chips label="Fonction" value={room.function} options={ROOM_FNS} labels={ROOM_LABELS} onChange={(m) => commitSelected({ function: m })} />
              <More label="Occupation">
                <Param
                  label="Occupants"
                  value={room.occupancy ?? 1}
                  min={0}
                  max={40}
                  step={1}
                  unit=""
                  digits={0}
                  onBegin={beginEdit}
                  onChange={(v) => patchSelected({ occupancy: Math.round(v) })}
                />
                <Param
                  label="HSP"
                  value={room.clearHeight ?? 2.5}
                  min={2.1}
                  max={6}
                  step={0.05}
                  onBegin={beginEdit}
                  onChange={(v) => patchSelected({ clearHeight: v })}
                />
                <ToggleRow label="Chauffé" on={room.heated !== false} onChange={(v) => commitSelected({ heated: v })} />
              </More>
              <More label="Sol">
                <Chips
                  label="Sol"
                  value={(room.floorFinish ?? "parquet") as MaterialId}
                  options={STRUCT_MATS}
                  labels={MATERIAL_LABELS}
                  onChange={(m) => commitSelected({ floorFinish: m })}
                />
              </More>
            </Section>
          )}
          {furn && (
            <Section title={FURNITURE_LABELS[furn.kind] ?? "Objet"}>
              <div className="flex flex-wrap gap-1">
                {OBJECT_CATALOG.filter((o) => o.group === (objectDef(furn.kind)?.group ?? "living"))
                  .slice(0, 6)
                  .map((o) => (
                    <button
                      key={o.kind}
                      type="button"
                      onClick={() => {
                        const sz = OBJECT_SIZES[o.kind];
                        commitSelected({ kind: o.kind, ...(sz ?? {}) });
                      }}
                      className={`h-8 rounded-md px-2 text-[11px] font-medium ${
                        furn.kind === o.kind ? "bg-accent/15 text-accent ring-1 ring-accent/40" : "bg-elevated text-fg/80"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent("forma-open-library"))}
                  className="h-8 rounded-md px-2 text-[11px] font-medium text-accent ring-1 ring-accent/30"
                >
                  Tous…
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  const sz = OBJECT_SIZES[furn.kind];
                  if (sz) commitSelected({ w: sz.w, d: sz.d, h: sz.h });
                }}
                className="flex h-8 w-full items-center justify-center rounded-md text-[11px] font-medium text-muted hover:bg-elevated hover:text-fg"
              >
                Taille catalogue
              </button>
              <ParamGrid>
              <Param label="Largeur" value={furn.w} min={0.1} max={12} step={0.05} onBegin={beginEdit} onChange={(v) => patchSelected({ w: v })} />
              <Param label="Profondeur" value={furn.d} min={0.1} max={12} step={0.05} onBegin={beginEdit} onChange={(v) => patchSelected({ d: v })} />
              </ParamGrid>
              <More label="Hauteur · rotation">
              <ParamGrid>
              <Param label="Hauteur" value={furn.h} min={0.02} max={8} step={0.05} onBegin={beginEdit} onChange={(v) => patchSelected({ h: v })} />
              <Param label="Rotation" value={(furn.rotation * 180) / Math.PI} min={0} max={360} step={5} unit="°" digits={0} onBegin={beginEdit} onChange={(v) => patchSelected({ rotation: (v * Math.PI) / 180 })} />
              </ParamGrid>
              </More>
            </Section>
          )}
          {column && (
            <Section title="Poteau">
              <ParamGrid>
              <Param label="Section X" value={column.width} min={0.1} max={1.2} step={0.02} onBegin={beginEdit} onChange={(v) => patchSelected({ width: v })} />
              <Param label="Section Y" value={column.depth} min={0.1} max={1.2} step={0.02} onBegin={beginEdit} onChange={(v) => patchSelected({ depth: v })} />
              </ParamGrid>
              <Param label="Hauteur" value={column.height} min={1} max={12} step={0.05} onBegin={beginEdit} onChange={(v) => patchSelected({ height: v })} />
              <More label="Matériau">
              <Chips label="Matériau" value={column.materialId} options={STRUCT_MATS} labels={MATERIAL_LABELS} onChange={(m) => commitSelected({ materialId: m })} />
              </More>
            </Section>
          )}
          {stair && (
            <Section title="Escalier">
              <ParamGrid>
              <Param label="Largeur" value={stair.width} min={0.7} max={2.4} step={0.05} onBegin={beginEdit} onChange={(v) => patchSelected({ width: v })} />
              <Param label="Giron total" value={stair.run} min={1.5} max={12} step={0.05} onBegin={beginEdit} onChange={(v) => patchSelected({ run: v })} />
              </ParamGrid>
              <Param label="Hauteur" value={stair.rise} min={2} max={6} step={0.05} onBegin={beginEdit} onChange={(v) => patchSelected({ rise: v })} />
              <More label="Type">
                <div className="flex flex-wrap gap-1.5">
                  {STAIR_PRESETS.map((pr) => (
                    <button key={pr.id} type="button" onClick={() => commitSelected({ width: pr.width, steps: pr.steps })} className="h-9 bg-elevated px-2.5 text-xs">
                      {pr.label}
                    </button>
                  ))}
                </div>
              </More>
            </Section>
          )}
          {slab && (
            <Section title="Dalle">
              <Param label="Épaisseur" value={slab.thickness} min={0.08} max={0.5} step={0.01} onBegin={beginEdit} onChange={(v) => patchSelected({ thickness: v })} />
              <More label="Type · matériau">
                <div className="flex flex-wrap gap-1.5">
                  {SLAB_PRESETS.map((pr) => (
                    <button key={pr.id} type="button" onClick={() => commitSelected({ thickness: pr.thickness })} className="h-9 bg-elevated px-2.5 text-xs">
                      {pr.label}
                    </button>
                  ))}
                </div>
                <Chips label="Matériau" value={slab.materialId} options={STRUCT_MATS} labels={MATERIAL_LABELS} onChange={(m) => commitSelected({ materialId: m })} />
              </More>
            </Section>
          )}
          {roof && (
            <Section title="Toiture">
              <ParamGrid>
              <Param label="Pente" value={roof.pitch} min={0} max={55} step={1} unit="°" digits={0} onBegin={beginEdit} onChange={(v) => patchSelected({ pitch: v })} />
              <Param label="Débord" value={roof.overhang} min={0} max={1.5} step={0.05} onBegin={beginEdit} onChange={(v) => patchSelected({ overhang: v })} />
              </ParamGrid>
              <More label="Type · matériau">
                <div className="flex flex-wrap gap-1.5">
                  {ROOF_PRESETS.map((pr) => (
                    <button key={pr.id} type="button" onClick={() => commitSelected({ pitch: pr.pitch, kind: pr.kind, overhang: pr.overhang })} className="h-9 bg-elevated px-2.5 text-xs">
                      {pr.label}
                    </button>
                  ))}
                </div>
                <Chips label="Matériau" value={roof.materialId} options={STRUCT_MATS} labels={MATERIAL_LABELS} onChange={(m) => commitSelected({ materialId: m })} />
              </More>
            </Section>
          )}
          {id && (
            <More label="Actions">
              <Button variant="danger" className="w-full" onClick={deleteSelected}>
                Supprimer
              </Button>
            </More>
          )}
          {!id && !compact && (
            <p className="text-[11px] text-muted">Touchez un ouvrage — ou Étages.</p>
          )}
        </>
      )}

      {!compact && tab === "projet" && (
        <>
          <More label="Faisabilité">
          <FeasibilityCard
            project={project}
            lighting={lighting}
            analysis={analysis()}
            onApplyCity={(preset) => {
              beginEdit();
              patchMeta(applyCityPresetMeta(preset));
              toast.success(`Preset ${preset.label} · indicatif`);
            }}
          />
          </More>
          <Section title="Projet">
            <Field label="Nom">
              <Input value={project.name} onChange={(e) => renameCurrent(e.target.value)} />
            </Field>
            <Field label="Lieu">
              <Input value={project.meta.location} onFocus={beginEdit} onChange={(e) => patchMeta({ location: e.target.value })} />
            </Field>
            <More label="Parcelle">
            <Param label="Latitude" value={project.meta.latitude} min={-45} max={65} step={0.5} unit="°" digits={1} onBegin={beginEdit} onChange={(v) => patchMeta({ latitude: v })} />
            <Param label="Nord" value={project.meta.north} min={0} max={360} step={5} unit="°" digits={0} onBegin={beginEdit} onChange={(v) => patchMeta({ north: v })} />
            <Chips label="Typologie" value={project.meta.typology ?? "house"} options={["house", "villa", "collective", "office", "atelier"] as Typology[]} labels={TYPOLOGY_LABELS} onChange={(t) => patchMeta({ typology: t })} />
            <ParcelAddressSearch
              project={project}
              onApply={(patch) => {
                beginEdit();
                patchMeta(patch);
              }}
            />
            <Param label="Parcelle" value={project.meta.plotM2 ?? 0} min={80} max={100000} step={50} unit="m²" digits={0} onBegin={beginEdit} onChange={(v) => patchMeta({ plotM2: v })} />
            <Param label="CES max" value={project.meta.ces ?? 0.4} min={0.1} max={1} step={0.05} unit="" digits={2} onBegin={beginEdit} onChange={(v) => patchMeta({ ces: v })} />
            <Param label="COS max" value={project.meta.cos ?? 0.6} min={0.1} max={8} step={0.05} unit="" digits={2} onBegin={beginEdit} onChange={(v) => patchMeta({ cos: v })} />
            </More>
            <More label="Réglementation">
              <Field label="Maître d'ouvrage">
                <Input value={project.meta.client} onFocus={beginEdit} onChange={(e) => patchMeta({ client: e.target.value })} />
              </Field>
              <Chips label="Climat" value={(project.meta.climate as ClimateZone) || "H2"} options={["H1", "H2", "H3"] as ClimateZone[]} labels={CLIMATE_LABELS} onChange={(c) => patchMeta({ climate: c })} />
              <Chips label="Classe énergie" value={project.meta.energyClass ?? "B"} options={["A", "B", "C", "D", "E", "F"] as EnergyClass[]} labels={ENERGY_LABELS} onChange={(c) => patchMeta({ energyClass: c })} />
              <SiteRatios analysis={analysis()} plot={project.meta.plotM2 ?? 0} cesCap={project.meta.ces ?? 0.4} cosCap={project.meta.cos ?? 0.6} />
              <Chips label="Sismique" value={project.meta.seismic ?? "2"} options={["1", "2", "3", "4", "5"] as SeismicZone[]} labels={SEISMIC_LABELS} onChange={(z) => patchMeta({ seismic: z })} />
              <Chips label="Vent" value={project.meta.wind ?? "2"} options={["1", "2", "3", "4", "5"] as WindRegion[]} labels={WIND_LABELS} onChange={(z) => patchMeta({ wind: z })} />
            </More>
          </Section>
        </>
      )}

      {!compact && tab === "niveaux" && <StoriesPanel />}

      {!compact && tab === "rendu" && (
        <>
          <Section title="Lumière">
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {LIGHT_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setLighting(p.patch)}
                  className={`h-8 shrink-0 px-3 text-[11px] font-medium ring-1 transition-colors ${
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
            <More label="Réglages">
            <Param label="Heure solaire" value={lighting.sunHour} min={5} max={22} step={0.25} unit="h" digits={1} onBegin={beginEdit} onChange={(v) => setLighting({ sunHour: v })} />
            <ToggleRow label="Physique (visite)" on={physics} onChange={setPhysics} />
            <Param label="Coupe (clip Y)" value={clipY} min={0.15} max={1} step={0.02} unit="" digits={2} onBegin={beginEdit} onChange={setClipY} />
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
            <Param label="Ciel" value={lighting.hemi} min={0} max={1.5} step={0.05} unit="" digits={2} onBegin={beginEdit} onChange={(v) => setLighting({ hemi: v })} />
            <Param label="Ambiance" value={lighting.ambient} min={0} max={1.2} step={0.05} unit="" digits={2} onBegin={beginEdit} onChange={(v) => setLighting({ ambient: v })} />
            <Param label="Fill" value={lighting.fill} min={0} max={1.2} step={0.05} unit="" digits={2} onBegin={beginEdit} onChange={(v) => setLighting({ fill: v })} />
            <Param label="Exposition" value={lighting.exposure} min={0.4} max={2} step={0.05} unit="" digits={2} onBegin={beginEdit} onChange={(v) => setLighting({ exposure: v })} />
            <Param label="Gain intérieur" value={lighting.interiorGain} min={0.2} max={2} step={0.05} unit="" digits={2} onBegin={beginEdit} onChange={(v) => setLighting({ interiorGain: v })} />
            <Chips label="Intérieur" value={lighting.interior} options={["off", "auto", "on"]} labels={{ off: "Éteint", auto: "Auto", on: "Allumé" }} onChange={(v) => setLighting({ interior: v as "off" | "auto" | "on" })} />
            </More>
          </Section>
          <More label="Navigation 3D">
            <NavOptions />
          </More>
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
  const createBlank = useStudio((s) => s.createBlank);
  const propagateTypical = useStudio((s) => s.propagateTypical);
  const detachStory = useStudio((s) => s.detachStory);
  const linkStory = useStudio((s) => s.linkStory);
  const markStoryAttic = useStudio((s) => s.markStoryAttic);
  const markStoryGround = useStudio((s) => s.markStoryGround);
  const commit = useStudio((s) => s.commit);
  const [spanW, setSpanW] = useState(18);
  const [spanD, setSpanD] = useState(16);
  const [floors, setFloors] = useState(8);
  const [hsp, setHsp] = useState(2.8);
  const [groundH, setGroundH] = useState(3.2);
  const [winSpacing, setWinSpacing] = useState(3.0);
  const [winSill, setWinSill] = useState(0.9);
  const [winW, setWinW] = useState(1.4);
  const [winH, setWinH] = useState(1.4);
  const [columns, setColumns] = useState(true);
  const [colSpan, setColSpan] = useState(5.5);
  const [roofKind, setRoofKind] = useState<"flat" | "shed" | "gable">("flat");
  const [coreSide, setCoreSide] = useState<"center" | "left" | "right" | "back">("center");
  const [balconyDepth, setBalconyDepth] = useState(1.1);
  const [setback, setSetback] = useState(0);
  if (!project) return null;
  const active = storyId ?? project.stories[0]?.id;
  const tall = project.stories.reduce((h, st) => h + st.height, 0);
  const rLabel = massingFootprintHint({ width: spanW, depth: spanD, floors });
  const tallMass = floors <= 1 ? groundH : groundH + Math.max(0, floors - 1) * hsp;

  const massingOpts = () => ({
    width: spanW,
    depth: spanD,
    floors,
    floorHeight: hsp,
    groundHeight: groundH,
    windowSpacing: winSpacing,
    windowSill: winSill,
    windowWidth: winW,
    windowHeight: winH,
    columns,
    columnSpacing: colSpan,
    roofKind,
    coreSide,
    balconyDepth,
    setback,
  });

  const runMassing = () => {
    addMassing(massingOpts());
    toast.success(`${rLabel} généré`);
  };

  const runMassingFresh = () => {
    // createBlank bascule `currentId` de facon synchrone : le addMassing qui
    // suit s'applique donc bien au projet neuf, pas a la maquette d'origine.
    createBlank(rLabel);
    addMassing(massingOpts());
    toast.success(`${rLabel} généré dans un projet neuf`);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <p className="text-xs">
          <span className="font-display font-semibold">{project.stories.length}</span>
          <span className="text-muted"> niv.</span>
          {typicalGroupSize(project, active) > 1 && isLiveTypical(project.stories.find((s) => s.id === active)) && (
            <span className="ml-2 text-[11px] font-medium text-accent">{typicalGroupSize(project, active)} types liés</span>
          )}
        </p>
        <p className="font-mono text-[11px] text-muted tabular">{tall.toFixed(1)} m</p>
      </div>
      <More label="Massing">
      <Section title="Nouvel immeuble">
        <p className="text-xs text-muted">Volume A→Z — façades, poteaux, toiture, noyau. Jusqu’à R+80.</p>
        <Param label="Largeur" value={spanW} min={8} max={60} step={0.5} onBegin={beginEdit} onChange={setSpanW} />
        <Param label="Profondeur" value={spanD} min={8} max={50} step={0.5} onBegin={beginEdit} onChange={setSpanD} />
        <Param label="Étages" value={floors} min={1} max={80} step={1} unit="" digits={0} onBegin={beginEdit} onChange={setFloors} />
        <Param label="HSP RDC" value={groundH} min={2.4} max={6} step={0.05} onBegin={beginEdit} onChange={setGroundH} />
        <Param label="HSP courant" value={hsp} min={2.4} max={5} step={0.05} onBegin={beginEdit} onChange={setHsp} />
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] tracking-wide text-muted uppercase">Noyau</span>
          <div className="grid grid-cols-4 gap-1">
            {([
              ["center", "Centre"],
              ["left", "Gauche"],
              ["right", "Droite"],
              ["back", "Fond"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setCoreSide(id)}
                className={`h-11 text-[11px] font-medium ${coreSide === id ? "bg-accent text-accent-fg" : "bg-elevated text-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] tracking-wide text-muted uppercase">Toiture</span>
          <div className="grid grid-cols-3 gap-1">
            {([
              ["flat", "Plate"],
              ["shed", "1 pente"],
              ["gable", "2 pentes"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setRoofKind(id)}
                className={`h-11 text-[11px] font-medium ${roofKind === id ? "bg-accent text-accent-fg" : "bg-elevated text-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <More label="Façade">
          <Param label="Module fenêtres" value={winSpacing} min={1.6} max={6} step={0.1} onBegin={beginEdit} onChange={setWinSpacing} />
          <Param label="Allège" value={winSill} min={0.2} max={1.4} step={0.05} onBegin={beginEdit} onChange={setWinSill} />
          <Param label="L fenêtre" value={winW} min={0.8} max={2.8} step={0.05} onBegin={beginEdit} onChange={setWinW} />
          <Param label="H fenêtre" value={winH} min={0.8} max={2.6} step={0.05} onBegin={beginEdit} onChange={setWinH} />
          <Param label="Balcon" value={balconyDepth} min={0} max={2.4} step={0.1} onBegin={beginEdit} onChange={setBalconyDepth} />
          <Param label="Retrait façade" value={setback} min={0} max={6} step={0.25} onBegin={beginEdit} onChange={setSetback} />
          <ToggleRow label="Poteaux structure" on={columns} onChange={setColumns} />
          {columns && (
            <Param label="Trame poteaux" value={colSpan} min={3.5} max={8} step={0.25} onBegin={beginEdit} onChange={setColSpan} />
          )}
        </More>
        <div className="flex flex-col gap-1">
          <MassingLaunch
            project={project}
            label={`Générer · ${rLabel} (${tallMass.toFixed(1)} m)`}
            hint={`${floors} × HSP · RDC ${groundH.toFixed(2)} m${
              floors > 1 ? ` · courant ${hsp.toFixed(2)} m` : ""
            }`}
            onRun={runMassing}
            onRunFresh={runMassingFresh}
          />
        </div>
      </Section>
      </More>
      <div className="flex flex-wrap gap-1">
        {project.stories.map((st, i) => (
          <button
            key={st.id}
            type="button"
            onClick={() => setStory(st.id)}
            className={`h-7 rounded-full px-2.5 text-[10px] font-medium ${
              st.id === active ? "bg-accent/15 text-accent ring-1 ring-accent/40" : "bg-elevated text-muted"
            }`}
          >
            {st.name || (i === 0 ? "RDC" : `R+${i}`)}
          </button>
        ))}
      </div>
      <More label="Actions">
      {project.stories.filter((st) => st.id === active).map((st) => {
        const i = project.stories.findIndex((s) => s.id === st.id);
        return (
        <div key={`hsp-${st.id}`}>
          <Param label="HSP" value={st.height} min={2.2} max={12} step={0.05} onBegin={beginEdit} onChange={(v) => patchStory(st.id, { height: v })} />
          {i === 0 && (
            <Param label="Niveau 0" value={st.elevation} min={-12} max={40} step={0.05} onBegin={beginEdit} onChange={(v) => patchStory(st.id, { elevation: v })} />
          )}
        </div>
        );
      })}
      <ToggleRow label="Isoler" on={isolateStory} onChange={setIsolateStory} />
      <div className="grid grid-cols-4 gap-1.5">
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
      <Button
        variant="outline"
        onClick={() => {
          propagateTypical();
          toast.success("Étage type propagé");
        }}
      >
        Propager cet étage
      </Button>
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
      {project.stories.filter((st) => st.id === active).map((st) => {
        const i = project.stories.findIndex((s) => s.id === st.id);
        return (
        <div key={st.id} className="rounded-md border border-border/70 px-2.5 py-2">
          <Field label="Nom">
            <Input value={st.name} onFocus={beginEdit} onChange={(e) => patchStory(st.id, { name: e.target.value })} />
          </Field>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {st.role === "typical" && !st.detached && (
              <button
                type="button"
                className="h-9 rounded-full bg-accent/15 px-3 text-[11px] font-medium text-accent"
                title="Délier cet étage du groupe type"
                onClick={() => {
                  detachStory(st.id);
                  toast.message("Étage délié — exception");
                }}
              >
                Lié
              </button>
            )}
            {st.role === "typical" && st.detached && (
              <button
                type="button"
                className="h-9 rounded-full bg-elevated px-3 text-[11px] font-medium text-muted"
                title="Relier au groupe type"
                onClick={() => {
                  linkStory(st.id);
                  toast.success("Étage relié au type");
                }}
              >
                Relier
              </button>
            )}
            {st.role === "typical" && !st.detached && (
              <button
                type="button"
                className="h-9 rounded-full bg-elevated px-3 text-[11px] font-medium text-muted"
                onClick={() => {
                  detachStory(st.id);
                  toast.message("Étage délié — exception");
                }}
              >
                Délier
              </button>
            )}
            {st.role !== "attic" && (
              <button
                type="button"
                className="h-9 rounded-full bg-elevated px-3 text-[11px] font-medium text-muted"
                onClick={() => {
                  markStoryAttic(st.id);
                  toast.message("Marqué attique");
                }}
              >
                Marquer attique
              </button>
            )}
            {st.role !== "ground" && st.role !== "basement" && (
              <button
                type="button"
                className="h-9 rounded-full bg-elevated px-3 text-[11px] font-medium text-muted"
                onClick={() => {
                  markStoryGround(st.id);
                  toast.message("Marqué RDC");
                }}
              >
                Marquer RDC
              </button>
            )}
            {st.role === "attic" && (
              <span className="inline-flex h-9 items-center rounded-full bg-elevated px-3 text-[11px] text-muted">Attique</span>
            )}
            {st.role === "ground" && (
              <span className="inline-flex h-9 items-center rounded-full bg-elevated px-3 text-[11px] text-muted">RDC</span>
            )}
            {st.role === "basement" && (
              <span className="inline-flex h-9 items-center rounded-full bg-elevated px-3 text-[11px] text-muted">SS</span>
            )}
          </div>
          {isLiveTypical(st) && typicalGroupSize(project, st.id) > 1 && st.id === active && (
            <p className="mt-2 text-[11px] text-accent">Édition → {typicalGroupSize(project, st.id)} étages types</p>
          )}
          {project.stories.length > 1 && (
            <Button variant="ghost" size="sm" className="mt-2 text-danger" onClick={() => removeStory(st.id)}>
              Retirer ce niveau
            </Button>
          )}
        </div>
        );
      })}
      </More>
    </div>
  );
}

function ParamGrid({ children }: { children: ReactNode }) {
  return <div className="param-grid">{children}</div>;
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

function More({ label = "Avancé", children }: { label?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="more-btn flex h-9 items-center justify-between rounded-md px-2.5 text-[11px] font-medium uppercase ring-1 ring-border/50"
      >
        {label}
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

function verdictTone(v: FeasibilityVerdict): string {
  if (v === "ok") return "bg-accent/15 text-accent ring-accent/45";
  if (v === "watch") return "bg-warn/15 text-warn ring-warn/40";
  return "bg-danger/15 text-danger ring-danger/40";
}

function FeasibilityCard({
  project,
  lighting,
  analysis: a,
  onApplyCity,
}: {
  project: Project;
  lighting: { month: number };
  analysis: ProjectAnalysis | null;
  onApplyCity: (p: (typeof CITY_PRESETS)[number]) => void;
}) {
  const report = assessFeasibility(project, lighting, a ?? undefined);
  const cesPct = report.gauges.ces.actual * 100;
  const cesCapPct = report.gauges.ces.cap > 0 ? report.gauges.ces.cap * 100 : 0;
  const cosFill =
    report.gauges.cos.cap > 0
      ? Math.min(100, (report.gauges.cos.actual / report.gauges.cos.cap) * 100)
      : Math.min(100, report.gauges.cos.actual * 40);
  const cesFill =
    report.gauges.ces.cap > 0
      ? Math.min(100, (report.gauges.ces.actual / report.gauges.ces.cap) * 100)
      : Math.min(100, cesPct);

  return (
    <section className="panel-card flex flex-col gap-3 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Faisabilité</p>
          <p className="mt-0.5 text-[10px] text-subtle">CES / COS · soleil · typologie · indicatif</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ring-1 ${verdictTone(report.verdict)}`}
          >
            {VERDICT_LABELS[report.verdict]}
          </span>
          <span className="font-mono text-lg font-semibold tabular text-fg">{report.score}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <GaugeBar
          label="CES"
          valueLabel={`${cesPct.toFixed(0)} %${cesCapPct ? ` / ${cesCapPct.toFixed(0)} %` : ""}`}
          fill={cesFill}
          ok={report.gauges.ces.ok}
        />
        <GaugeBar
          label="COS"
          valueLabel={`${report.gauges.cos.actual.toFixed(2)}${report.gauges.cos.cap > 0 ? ` / ${report.gauges.cos.cap.toFixed(2)}` : ""}`}
          fill={cosFill}
          ok={report.gauges.cos.ok}
        />
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        <MiniStat label="Jour" value={`${report.gauges.daylight}`} />
        <MiniStat label="Énergie" value={`${report.gauges.energy}`} />
        <MiniStat label="H" value={`${report.heightM.toFixed(1)} m`} />
        <MiniStat label="SDP" value={`${Math.round(report.sdp)}`} />
      </div>

      <div>
        <p className="mb-1.5 text-[10px] tracking-wide text-muted uppercase">Villes · indicatif</p>
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {CITY_PRESETS.map((c) => {
            const on =
              Math.abs(project.meta.latitude - c.latitude) < 0.2 &&
              (project.meta.location || "").toLowerCase().includes(c.label.toLowerCase());
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onApplyCity(c)}
                className={`h-9 shrink-0 rounded-full px-3 text-[11px] font-medium ring-1 transition-colors ${
                  on
                    ? "bg-accent/15 text-accent ring-accent/45"
                    : "bg-elevated text-muted ring-border/50 hover:text-fg"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] leading-snug text-muted">{report.solarHint}</p>
      {report.bullets.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-border/50 pt-2">
          {report.bullets.slice(0, 4).map((b) => (
            <li key={b} className="text-[11px] leading-snug text-subtle">
              · {b}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function GaugeBar({
  label,
  valueLabel,
  fill,
  ok,
}: {
  label: string;
  valueLabel: string;
  fill: number;
  ok: boolean;
}) {
  return (
    <div className="rounded-lg bg-elevated/40 px-2.5 py-2">
      <div className="mb-1 flex items-baseline justify-between gap-1">
        <span className="text-[10px] tracking-wide text-muted uppercase">{label}</span>
        <span className={`font-mono text-[11px] tabular ${ok ? "text-accent" : "text-danger"}`}>{valueLabel}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-border/60">
        <div
          className={`h-full rounded-full transition-[width] ${ok ? "bg-accent" : "bg-danger"}`}
          style={{ width: `${Math.max(4, Math.min(100, fill))}%` }}
        />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-elevated/35 px-1.5 py-1.5 text-center">
      <p className="text-[9px] tracking-wide text-muted uppercase">{label}</p>
      <p className="font-mono text-[11px] tabular text-fg">{value}</p>
    </div>
  );
}


function ParcelAddressSearch({
  project,
  onApply,
}: {
  project: Project;
  onApply: (patch: Partial<Project["meta"]>) => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<BanHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"idle" | "search" | "parcel">("idle");
  const parcelle = project.meta.parcelle;

  async function runSearch() {
    const query = q.trim();
    if (query.length < 3) {
      toast.message("Saisissez une adresse (3 caractères min.)");
      return;
    }
    setBusy(true);
    setPhase("search");
    try {
      const results = await geoSearchAddress(query);
      setHits(results);
      if (results.length === 0) toast.message("Aucune adresse trouvée");
    } catch (err) {
      toast.error(frenchGeoError(err));
      setHits([]);
    } finally {
      setBusy(false);
      setPhase("idle");
    }
  }

  async function pick(hit: BanHit) {
    setBusy(true);
    setPhase("parcel");
    try {
      const parcelle = await geoParcelleAt(hit.lon, hit.lat, hit.label);
      const patch = parcelleToMetaPatch(parcelle);
      onApply(patch);
      setHits([]);
      setQ(hit.label);
      toast.success(
        `Parcelle ${formatCadastralRef(parcelle)} · ${Math.round(parcelle.areaM2).toLocaleString("fr-FR")} m² · contour affiché`,
      );
    } catch (err) {
      toast.error(frenchGeoError(err));
    } finally {
      setBusy(false);
      setPhase("idle");
    }
  }

  const busyLabel =
    phase === "parcel" ? "Parcelle…" : phase === "search" ? "Recherche…" : "…";

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border/60 bg-elevated/30 p-2.5">
      <p className="text-[10px] font-semibold tracking-[0.12em] text-muted uppercase">Adresse / parcelle</p>
      <div className="flex gap-1.5">
        <Input
          value={q}
          placeholder="ex. 10 rue de Rivoli Paris"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void runSearch();
            }
          }}
          className="h-11 flex-1 text-xs"
          aria-busy={busy}
        />
        <Button type="button" variant="outline" className="h-11 min-h-11 shrink-0 px-3 text-xs" disabled={busy} onClick={() => void runSearch()}>
          {busy ? busyLabel : "Chercher"}
        </Button>
      </div>
      {busy && (
        <p className="text-[11px] text-muted">
          {phase === "parcel" ? "Récupération du contour cadastral…" : "Recherche d’adresse (BAN)…"}
        </p>
      )}
      {hits.length > 0 && (
        <ul className="max-h-44 overflow-y-auto rounded-md border border-border/50 bg-panel">
          {hits.map((h) => (
            <li key={`${h.label}-${h.lon}-${h.lat}`}>
              <button
                type="button"
                className="flex min-h-11 w-full items-center px-3 py-2.5 text-left text-[12px] text-fg hover:bg-accent/10 disabled:opacity-50"
                onClick={() => void pick(h)}
                disabled={busy}
              >
                {h.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {parcelle && (
        <p className="font-mono text-[10px] leading-snug text-accent">
          {formatCadastralRef(parcelle)}
          {" · "}
          {Math.round(parcelle.areaM2).toLocaleString("fr-FR")} m²
          {parcelle.ring && parcelle.ring.length >= 3 ? " · contour OK" : ""}
        </p>
      )}
      <p className="text-[9px] leading-snug text-subtle">{CADASTRE_DISCLAIMER}</p>
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
    <label className="flex flex-col gap-0.5" onPointerDown={(e) => e.stopPropagation()}>
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-medium tracking-wide text-muted uppercase">{label}</span>
        <span className="flex items-center gap-1">
          <input
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={step}
            value={n.toFixed(digits)}
            aria-label={label}
            onFocus={onBegin}
            onChange={(e) => apply(Number(e.target.value))}
            className="h-7 w-[4.25rem] rounded-md border border-border bg-elevated px-1.5 text-right font-mono text-xs tabular focus:border-accent/50 focus:outline-none"
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
          className="param-step flex size-11 shrink-0 items-center justify-center rounded-md bg-elevated text-lg ring-1 ring-border/50 active:bg-accent/15"
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
            className="relative h-6 w-full cursor-pointer appearance-none bg-transparent accent-accent [touch-action:none]"
          />
        </div>
        <button
          type="button"
          aria-label="Augmenter"
          className="param-step flex size-11 shrink-0 items-center justify-center rounded-md bg-elevated text-lg ring-1 ring-border/50 active:bg-accent/15"
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
