import * as THREE from 'three'

const cache = new Map<string, THREE.CanvasTexture>()

function makeCanvas(key: string, size: number, paint: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const hit = cache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  paint(ctx, size)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  tex.colorSpace = THREE.SRGBColorSpace
  cache.set(key, tex)
  return tex
}

function noise(ctx: CanvasRenderingContext2D, size: number, density: number, alpha: number, color: string) {
  ctx.fillStyle = color
  for (let i = 0; i < density; i++) {
    ctx.globalAlpha = alpha * Math.random()
    const x = Math.random() * size
    const y = Math.random() * size
    const r = 0.5 + Math.random() * 1.8
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

export function plasterMap(size = 256): THREE.CanvasTexture {
  return makeCanvas(`plaster-${size}`, size, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, s, s)
    g.addColorStop(0, '#f2efe8')
    g.addColorStop(0.5, '#e8e2d6')
    g.addColorStop(1, '#ddd6c8')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
    noise(ctx, s, 1800, 0.08, '#cfc7b8')
    noise(ctx, s, 600, 0.05, '#fffaf0')
  })
}

export function concreteMap(size = 256): THREE.CanvasTexture {
  return makeCanvas(`concrete-${size}`, size, (ctx, s) => {
    ctx.fillStyle = '#9aa3a8'
    ctx.fillRect(0, 0, s, s)
    noise(ctx, s, 2200, 0.12, '#7a848a')
    noise(ctx, s, 900, 0.08, '#b8c0c4')
    ctx.strokeStyle = 'rgba(70,78,82,0.15)'
    ctx.lineWidth = 1
    for (let i = 0; i < 8; i++) {
      ctx.beginPath()
      ctx.moveTo(Math.random() * s, 0)
      ctx.lineTo(Math.random() * s, s)
      ctx.stroke()
    }
  })
}

export function woodMap(size = 256): THREE.CanvasTexture {
  return makeCanvas(`wood-${size}`, size, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, s, 0)
    g.addColorStop(0, '#6b4423')
    g.addColorStop(0.35, '#8b5a2b')
    g.addColorStop(0.55, '#5c3a1e')
    g.addColorStop(1, '#7a4e28')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
    ctx.strokeStyle = 'rgba(40,22,10,0.25)'
    for (let x = 0; x < s; x += 6) {
      ctx.beginPath()
      ctx.moveTo(x + Math.sin(x * 0.2) * 2, 0)
      ctx.lineTo(x, s)
      ctx.stroke()
    }
  })
}

export function tileMap(size = 256): THREE.CanvasTexture {
  return makeCanvas(`tile-${size}`, size, (ctx, s) => {
    ctx.fillStyle = '#7a3a1c'
    ctx.fillRect(0, 0, s, s)
    const cell = s / 8
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const ox = x * cell
        const oy = y * cell
        ctx.fillStyle = x % 2 === y % 2 ? '#8b4513' : '#6e3610'
        ctx.fillRect(ox + 1, oy + 1, cell - 2, cell - 2)
      }
    }
  })
}

export function grassMap(size = 256): THREE.CanvasTexture {
  return makeCanvas(`grass-${size}`, size, (ctx, s) => {
    const g = ctx.createRadialGradient(s * 0.5, s * 0.5, 10, s * 0.5, s * 0.5, s * 0.7)
    g.addColorStop(0, '#3f5f38')
    g.addColorStop(1, '#2a3f28')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
    noise(ctx, s, 3000, 0.15, '#4a7040')
    noise(ctx, s, 800, 0.1, '#1e2e1c')
  })
}

export function softShadowMap(size = 256): THREE.CanvasTexture {
  return makeCanvas(`softshadow-${size}`, size, (ctx, s) => {
    ctx.clearRect(0, 0, s, s)
    const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.05, s / 2, s / 2, s * 0.48)
    g.addColorStop(0, 'rgba(0,0,0,0.45)')
    g.addColorStop(0.45, 'rgba(0,0,0,0.18)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
  })
}

export function gridOverlayMap(size = 512): THREE.CanvasTexture {
  return makeCanvas(`grid-${size}`, size, (ctx, s) => {
    ctx.clearRect(0, 0, s, s)
    ctx.strokeStyle = 'rgba(110,208,195,0.18)'
    ctx.lineWidth = 1
    const step = s / 20
    for (let i = 0; i <= 20; i++) {
      const p = i * step
      ctx.beginPath()
      ctx.moveTo(p, 0)
      ctx.lineTo(p, s)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, p)
      ctx.lineTo(s, p)
      ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(110,208,195,0.35)'
    ctx.lineWidth = 1.5
    for (let i = 0; i <= 20; i += 5) {
      const p = i * step
      ctx.beginPath()
      ctx.moveTo(p, 0)
      ctx.lineTo(p, s)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, p)
      ctx.lineTo(s, p)
      ctx.stroke()
    }
  })
}
