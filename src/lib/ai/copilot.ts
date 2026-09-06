import type { MassingParams } from '../cad/massing'

export type CopilotResult =
  | { ok: true; params: MassingParams; summary: string }
  | { ok: false; message: string }

/**
 * Local massing prompt parser (no network).
 * Examples: "immeuble 12x18 8 etages", "tour 15 20 HSP 3.2 R+12"
 */
export function parseMassingPrompt(raw: string): CopilotResult {
  const text = raw.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  if (!text) return { ok: false, message: 'Decrivez un massing (ex. immeuble 12x18, 8 etages).' }

  let width = 12
  let depth = 18
  let floors = 4
  let floorHeight = 3

  const dim = text.match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/)
  if (dim) {
    width = Number(dim[1].replace(',', '.'))
    depth = Number(dim[2].replace(',', '.'))
  } else {
    const w = text.match(/larg(?:eur)?\s*[:=]?\s*(\d+(?:[.,]\d+)?)/)
    const d = text.match(/prof(?:ondeur)?\s*[:=]?\s*(\d+(?:[.,]\d+)?)/)
    if (w) width = Number(w[1].replace(',', '.'))
    if (d) depth = Number(d[1].replace(',', '.'))
  }

  const rplus = text.match(/r\s*\+\s*(\d+)/)
  const etages = text.match(/(\d+)\s*(?:etages?|niveaux?|floors?)/)
  if (rplus) floors = Number(rplus[1]) + 1
  else if (etages) floors = Number(etages[1])

  const hsp = text.match(/hsp\s*[:=]?\s*(\d+(?:[.,]\d+)?)/)
  if (hsp) floorHeight = Number(hsp[1].replace(',', '.'))

  width = Math.min(60, Math.max(6, width))
  depth = Math.min(60, Math.max(6, depth))
  floors = Math.min(80, Math.max(1, floors))
  floorHeight = Math.min(4.5, Math.max(2.5, floorHeight))

  const params: MassingParams = { width, depth, floors, floorHeight }
  const summary = `Massing ${width} x ${depth} m · ${floors} niveaux · HSP ${floorHeight} m`
  return { ok: true, params, summary }
}
