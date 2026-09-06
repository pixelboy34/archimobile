import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Furniture, Room, Wall } from '../../lib/bim/types'
import {
  computeVisitSpawn,
  resolveFurnitureCollision,
  resolveWallCollision,
} from '../../lib/cad/geom'

const EYE = 1.6
const SPEED = 3.4
const SPRINT = 6.2
const RADIUS = 0.28
const LOOK_SENS = 0.0018
const LOOK_SENS_TOUCH = 0.0026
const WALL_PAD = 0.1

/** Shared mobile joystick vector — VisitHud writes, VisitControls reads. */
export const visitMobileInput = {
  joyVec: { x: 0, y: 0 },
}

type Props = {
  walls: Wall[]
  furniture: Furniture[]
  rooms: Room[]
  elevation: number
  storyHeight: number
  enabled: boolean
  storyKey: string
}

/**
 * First-person walk: WASD / arrows + mouse look (desktop),
 * left joystick HUD + right-half look drag (mobile).
 * Wall + furniture footprint collision; stays on active story floor.
 */
export default function VisitControls({
  walls,
  furniture,
  rooms,
  elevation,
  storyHeight,
  enabled,
  storyKey,
}: Props) {
  const { camera, gl } = useThree()
  const keys = useRef(new Set<string>())
  const yaw = useRef(0)
  const pitch = useRef(0)
  const pos = useRef(new THREE.Vector3(0, elevation + EYE, 0))
  const fillLight = useRef<THREE.PointLight>(null)
  const initialized = useRef(false)
  const lastStoryKey = useRef<string | null>(null)
  const lookTouch = useRef<{
    active: boolean
    id: number | null
    last: { x: number; y: number }
  }>({ active: false, id: null, last: { x: 0, y: 0 } })
  const pointerLocked = useRef(false)
  const wallsRef = useRef(walls)
  const furnitureRef = useRef(furniture)
  wallsRef.current = walls
  furnitureRef.current = furniture

  const applyCamera = () => {
    camera.position.copy(pos.current)
    const look = new THREE.Vector3(
      pos.current.x + Math.sin(yaw.current) * Math.cos(pitch.current),
      pos.current.y + Math.sin(pitch.current),
      pos.current.z - Math.cos(yaw.current) * Math.cos(pitch.current),
    )
    camera.lookAt(look)
  }

  const spawnAt = (elev: number) => {
    const spawn = computeVisitSpawn(rooms, walls)
    pos.current.set(spawn.position.x, elev + EYE, spawn.position.y)
    yaw.current = spawn.yaw
    pitch.current = 0
    const resolved = resolveAll(pos.current.x, pos.current.z)
    pos.current.x = resolved.x
    pos.current.z = resolved.y
    // Apply immediately so first paint is not black / orbit leftover
    applyCamera()
  }

  const resolveAll = (x: number, z: number) => {
    let p = resolveWallCollision({ x, y: z }, RADIUS, wallsRef.current, WALL_PAD)
    p = resolveFurnitureCollision(p, RADIUS, furnitureRef.current)
    // Second wall pass after furniture push
    p = resolveWallCollision(p, RADIUS, wallsRef.current, WALL_PAD)
    return p
  }

  useEffect(() => {
    if (!enabled) {
      initialized.current = false
      lastStoryKey.current = null
      return
    }
    if (!initialized.current) {
      spawnAt(elevation)
      initialized.current = true
      lastStoryKey.current = storyKey
      return
    }
    // Story change while visiting: update eye height + clamp on new floor
    if (lastStoryKey.current !== storyKey) {
      lastStoryKey.current = storyKey
      pos.current.y = elevation + EYE
      const resolved = resolveAll(pos.current.x, pos.current.z)
      pos.current.x = resolved.x
      pos.current.z = resolved.y
    } else {
      pos.current.y = elevation + EYE
    }
    applyCamera()
    // elevation / storyKey / rooms / walls intentionally drive re-spawn/clamp
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, elevation, storyKey])

  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        if (document.pointerLockElement === gl.domElement) {
          document.exitPointerLock?.()
        }
        return
      }
      keys.current.add(e.code)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      keys.current.delete(e.code)
    }

    const el = gl.domElement

    const onClick = () => {
      if (window.matchMedia('(pointer: fine)').matches) {
        el.requestPointerLock?.()
      }
    }

    const onLockChange = () => {
      pointerLocked.current = document.pointerLockElement === el
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!pointerLocked.current) return
      yaw.current -= e.movementX * LOOK_SENS
      pitch.current = Math.max(-1.15, Math.min(1.15, pitch.current - e.movementY * LOOK_SENS))
    }

    // Mobile: look drag only on right half, below chrome
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return
      const rect = el.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      // Leave left 48% for joystick HUD; top 18% for chrome
      if (x < rect.width * 0.48) return
      if (y < rect.height * 0.14) return
      const lt = lookTouch.current
      if (lt.active) return
      lt.active = true
      lt.id = e.pointerId
      lt.last = { x: e.clientX, y: e.clientY }
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return
      const lt = lookTouch.current
      if (!lt.active || e.pointerId !== lt.id) return
      const dx = e.clientX - lt.last.x
      const dy = e.clientY - lt.last.y
      lt.last = { x: e.clientX, y: e.clientY }
      yaw.current -= dx * LOOK_SENS_TOUCH
      pitch.current = Math.max(-1.15, Math.min(1.15, pitch.current - dy * LOOK_SENS_TOUCH))
    }

    const onPointerUp = (e: PointerEvent) => {
      const lt = lookTouch.current
      if (e.pointerId === lt.id) {
        lt.active = false
        lt.id = null
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    el.addEventListener('click', onClick)
    document.addEventListener('pointerlockchange', onLockChange)
    document.addEventListener('mousemove', onMouseMove)
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      el.removeEventListener('click', onClick)
      document.removeEventListener('pointerlockchange', onLockChange)
      document.removeEventListener('mousemove', onMouseMove)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerUp)
      if (document.pointerLockElement === el) document.exitPointerLock?.()
      keys.current.clear()
      visitMobileInput.joyVec = { x: 0, y: 0 }
    }
  }, [enabled, gl])

  useFrame((_, dt) => {
    if (!enabled) return
    const k = keys.current
    const sprint = k.has('ShiftLeft') || k.has('ShiftRight')
    const speed = (sprint ? SPRINT : SPEED) * Math.min(dt, 0.05)

    let mx = 0
    let mz = 0
    if (k.has('KeyW') || k.has('ArrowUp')) mz -= 1
    if (k.has('KeyS') || k.has('ArrowDown')) mz += 1
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1

    const joy = visitMobileInput.joyVec
    mx += joy.x
    mz += joy.y

    const len = Math.hypot(mx, mz)
    if (len > 1e-4) {
      mx /= len
      mz /= len
      const cy = Math.cos(yaw.current)
      const sy = Math.sin(yaw.current)
      const dx = mx * cy + mz * sy
      const dz = -mx * sy + mz * cy
      pos.current.x += dx * speed
      pos.current.z += dz * speed
    }

    const resolved = resolveAll(pos.current.x, pos.current.z)
    pos.current.x = resolved.x
    pos.current.z = resolved.y
    // Stay on active story floor (simple slab) — no fall-through
    const floorY = elevation + EYE
    const ceiling = elevation + Math.max(storyHeight, EYE + 0.2) - 0.15
    pos.current.y = Math.min(ceiling, Math.max(floorY, floorY))

    camera.position.copy(pos.current)
    const look = new THREE.Vector3(
      pos.current.x + Math.sin(yaw.current) * Math.cos(pitch.current),
      pos.current.y + Math.sin(pitch.current),
      pos.current.z - Math.cos(yaw.current) * Math.cos(pitch.current),
    )
    camera.lookAt(look)
    if (fillLight.current) {
      fillLight.current.position.set(pos.current.x, pos.current.y + 0.25, pos.current.z)
    }
  })

  // Local fill follows the player — interiors readable even without pointer-lock
  return (
    <pointLight
      ref={fillLight}
      intensity={0.6}
      distance={14}
      decay={2}
      color="#dff5f0"
      position={[0, elevation + EYE + 0.25, 0]}
    />
  )
}

/** On-screen HUD for visite — interactive joystick + lock hint. */
export function VisitHud() {
  const [locked, setLocked] = useState(false)
  const [isFine, setIsFine] = useState(true)
  const knobRef = useRef<HTMLDivElement>(null)
  const baseRef = useRef<HTMLDivElement>(null)
  const joy = useRef<{
    active: boolean
    id: number | null
    ox: number
    oy: number
  }>({ active: false, id: null, ox: 0, oy: 0 })

  useEffect(() => {
    const mq = window.matchMedia('(pointer: fine)')
    setIsFine(mq.matches)
    const onMq = () => setIsFine(mq.matches)
    mq.addEventListener?.('change', onMq)
    const onLock = () => setLocked(!!document.pointerLockElement)
    document.addEventListener('pointerlockchange', onLock)
    onLock()
    return () => {
      mq.removeEventListener?.('change', onMq)
      document.removeEventListener('pointerlockchange', onLock)
      visitMobileInput.joyVec = { x: 0, y: 0 }
    }
  }, [])

  const setKnob = (nx: number, ny: number) => {
    const el = knobRef.current
    if (!el) return
    el.style.transform = `translate(calc(-50% + ${nx * 36}px), calc(-50% + ${ny * 36}px))`
  }

  const onJoyDown = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const base = baseRef.current
    if (!base) return
    const rect = base.getBoundingClientRect()
    joy.current = {
      active: true,
      id: e.pointerId,
      ox: rect.left + rect.width / 2,
      oy: rect.top + rect.height / 2,
    }
    try {
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const onJoyMove = (e: React.PointerEvent) => {
    if (!joy.current.active || e.pointerId !== joy.current.id) return
    e.preventDefault()
    e.stopPropagation()
    const dx = (e.clientX - joy.current.ox) / 64
    const dy = (e.clientY - joy.current.oy) / 64
    const len = Math.hypot(dx, dy) || 1
    const clamp = Math.min(1, len)
    const nx = (dx / len) * clamp
    const ny = (dy / len) * clamp
    visitMobileInput.joyVec = { x: nx, y: ny }
    setKnob(nx, ny)
  }

  const onJoyUp = (e: React.PointerEvent) => {
    if (e.pointerId !== joy.current.id) return
    joy.current.active = false
    joy.current.id = null
    visitMobileInput.joyVec = { x: 0, y: 0 }
    setKnob(0, 0)
  }

  return (
    <div className="absolute inset-0 z-10 pointer-events-none safe-x safe-bottom safe-top">
      {/* Desktop lock hint */}
      {isFine && !locked && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="pointer-events-none chip border-[#6ed0c3]/50 text-[#6ed0c3] text-sm px-5">
            clic pour regarder · WASD pour marcher
          </p>
        </div>
      )}
      {isFine && locked && (
        <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[11px] text-[#7a8f9c] font-mono text-center">
          WASD · Shift sprint · Esc liberer le curseur
        </p>
      )}

      {/* Mobile joystick — larger, safe-area, pointer-events */}
      {!isFine && (
        <>
          <div
            ref={baseRef}
            className="pointer-events-auto absolute bottom-[max(1.5rem,env(safe-area-inset-bottom,0px))] left-[max(1rem,env(safe-area-inset-left,0px))] w-36 h-36 rounded-full border border-[#6ed0c3]/40 bg-[#0a1218]/55 touch-none select-none"
            style={{ touchAction: 'none' }}
            onPointerDown={onJoyDown}
            onPointerMove={onJoyMove}
            onPointerUp={onJoyUp}
            onPointerCancel={onJoyUp}
          >
            <div
              ref={knobRef}
              className="absolute left-1/2 top-1/2 w-14 h-14 rounded-full bg-[#6ed0c3]/45 border border-[#6ed0c3]/70"
              style={{ transform: 'translate(-50%, -50%)' }}
            />
          </div>
          <p className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))] right-4 text-[11px] text-[#7a8f9c] font-mono text-right max-w-[42vw]">
            regard : glisser a droite
          </p>
        </>
      )}
    </div>
  )
}
