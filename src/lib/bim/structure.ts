import type { Project } from './types'
import { wallLength } from './types'

export type StructureFinding = {
  level: 'info' | 'warn' | 'ok'
  label: string
  detail: string
}

export type StructureReport = {
  findings: StructureFinding[]
  stats: {
    walls: number
    columns: number
    stories: number
    maxSpanM: number
    exteriorWalls: number
    coreElements: number
  }
}

/** Lightweight structural heuristics — not an engineer stamp. */
export function analyzeStructure(project: Project): StructureReport {
  const walls = project.walls
  const lengths = walls.map(wallLength)
  const maxSpanM = lengths.length ? Math.max(...lengths) : 0
  const exteriorWalls = walls.filter((w) => w.typology === 'exterior' || w.typology === 'curtain').length
  const coreElements =
    walls.filter((w) => w.typology === 'core').length +
    project.furniture.filter((f) => f.kind === 'elevator' || f.kind === 'staircore').length

  const findings: StructureFinding[] = []

  if (project.stories.length >= 4 && project.columns.length === 0 && coreElements === 0) {
    findings.push({
      level: 'warn',
      label: 'Noyau / poteaux',
      detail: `${project.stories.length} niveaux sans poteaux ni noyau detecte. Ajoutez un cage d'escalier / ascenseur ou des piliers.`,
    })
  } else if (coreElements > 0 || project.columns.length > 0) {
    findings.push({
      level: 'ok',
      label: 'Appuis verticaux',
      detail: `${project.columns.length} piliers · ${coreElements} elements de noyau.`,
    })
  }

  if (maxSpanM > 8) {
    findings.push({
      level: 'warn',
      label: 'Portee longue',
      detail: `Mur le plus long ~${maxSpanM.toFixed(1)} m. Au-dela de 8 m, prevoir poutre ou poteau intermediaire.`,
    })
  } else if (maxSpanM > 0) {
    findings.push({
      level: 'ok',
      label: 'Portees',
      detail: `Portee max ~${maxSpanM.toFixed(1)} m.`,
    })
  }

  const thinExt = walls.filter(
    (w) => (w.typology === 'exterior' || w.typology === 'curtain') && w.thickness < 0.2,
  ).length
  if (thinExt > 0) {
    findings.push({
      level: 'warn',
      label: 'Murs exterieurs fins',
      detail: `${thinExt} mur(s) < 20 cm. Verifier isolation / structure.`,
    })
  }

  if (project.stories.length > 1 && project.stairs.length === 0 && !project.furniture.some((f) => f.kind === 'staircore' || f.kind === 'elevator')) {
    findings.push({
      level: 'warn',
      label: 'Circulation verticale',
      detail: 'Plusieurs niveaux sans escalier ni cage. Ajoutez un escalier ou un noyau.',
    })
  }

  const sismo = project.meta.sismo
  if (sismo && Number(sismo) >= 3 && project.stories.length >= 5) {
    findings.push({
      level: 'info',
      label: 'Zone sismique',
      detail: `Zone ${sismo} + R+${project.stories.length - 1} : privilegier contreventement / noyau continu.`,
    })
  }

  if (findings.length === 0) {
    findings.push({
      level: 'info',
      label: 'Lecture',
      detail: 'Heuristiques basiques — pas un calcul structurel. Completer en Expert.',
    })
  }

  return {
    findings,
    stats: {
      walls: walls.length,
      columns: project.columns.length,
      stories: project.stories.length,
      maxSpanM,
      exteriorWalls,
      coreElements,
    },
  }
}
