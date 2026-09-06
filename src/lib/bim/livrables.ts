import type { Project } from './types'
import { wallLength } from './types'

function safeName(project: Project): string {
  return project.meta.name.replace(/[^\w\-]+/g, '_').slice(0, 40) || 'forma'
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadJson(project: Project): void {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
  downloadBlob(blob, `${safeName(project)}.json`)
}

export function downloadCsv(project: Project): void {
  const rows: string[][] = [
    ['type', 'id', 'story', 'kind', 'length_m', 'area_m2', 'x', 'y', 'notes'],
  ]
  const storyName = (id: string) => project.stories.find((s) => s.id === id)?.name ?? id

  for (const w of project.walls) {
    rows.push([
      'wall',
      w.id,
      storyName(w.storyId),
      w.typology,
      wallLength(w).toFixed(3),
      '',
      w.a.x.toFixed(3),
      w.a.y.toFixed(3),
      `th=${w.thickness}`,
    ])
  }
  for (const o of project.openings) {
    const wall = project.walls.find((w) => w.id === o.wallId)
    rows.push([
      'opening',
      o.id,
      wall ? storyName(wall.storyId) : '',
      o.kind,
      '',
      (o.width * o.height).toFixed(3),
      '',
      '',
      `t=${o.t}`,
    ])
  }
  for (const s of project.slabs) {
    rows.push(['slab', s.id, storyName(s.storyId), s.kind, '', '', '', '', `n=${s.polygon.length}`])
  }
  for (const f of project.furniture) {
    rows.push([
      'furniture',
      f.id,
      storyName(f.storyId),
      f.kind,
      '',
      '',
      f.position.x.toFixed(3),
      f.position.y.toFixed(3),
      '',
    ])
  }
  for (const c of project.columns) {
    rows.push([
      'column',
      c.id,
      storyName(c.storyId),
      'column',
      '',
      '',
      c.position.x.toFixed(3),
      c.position.y.toFixed(3),
      `${c.width}x${c.depth}`,
    ])
  }

  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  downloadBlob(new Blob([csv], { type: 'text/csv' }), `${safeName(project)}.csv`)
}

/** Minimal 2D DXF (LINE entities) of active geometry in plan. */
export function downloadDxf(project: Project, storyId?: string | null): void {
  const sid = storyId ?? project.stories[0]?.id
  const walls = sid ? project.walls.filter((w) => w.storyId === sid) : project.walls
  const lines: string[] = [
    '0',
    'SECTION',
    '2',
    'HEADER',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'ENTITIES',
  ]
  for (const w of walls) {
    lines.push(
      '0',
      'LINE',
      '8',
      'WALLS',
      '10',
      w.a.x.toFixed(4),
      '20',
      w.a.y.toFixed(4),
      '30',
      '0.0',
      '11',
      w.b.x.toFixed(4),
      '21',
      w.b.y.toFixed(4),
      '31',
      '0.0',
    )
  }
  for (const f of project.furniture.filter((x) => !sid || x.storyId === sid)) {
    const hx = f.width / 2
    const hz = f.depth / 2
    const corners = [
      [f.position.x - hx, f.position.y - hz],
      [f.position.x + hx, f.position.y - hz],
      [f.position.x + hx, f.position.y + hz],
      [f.position.x - hx, f.position.y + hz],
    ]
    for (let i = 0; i < 4; i++) {
      const a = corners[i]!
      const b = corners[(i + 1) % 4]!
      lines.push(
        '0',
        'LINE',
        '8',
        'FURNITURE',
        '10',
        a[0]!.toFixed(4),
        '20',
        a[1]!.toFixed(4),
        '30',
        '0.0',
        '11',
        b[0]!.toFixed(4),
        '21',
        b[1]!.toFixed(4),
        '31',
        '0.0',
      )
    }
  }
  lines.push('0', 'ENDSEC', '0', 'EOF')
  downloadBlob(new Blob([lines.join('\n')], { type: 'application/dxf' }), `${safeName(project)}.dxf`)
}
