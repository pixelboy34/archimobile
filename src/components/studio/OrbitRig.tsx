import { useRef, useEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

type Props = {
  target?: [number, number, number]
  enabled?: boolean
}

/**
 * Orbit maquette: grab the model.
 * Finger right -> building rotates with finger (theta -= dx).
 */
export default function OrbitRig({ target = [0, 1.2, 0], enabled = true }: Props) {
  const { camera, gl, invalidate } = useThree()
  const state = useRef({
    theta: Math.PI / 4,
    phi: Math.PI / 3.2,
    radius: 28,
    target: new THREE.Vector3(...target),
    dragging: false,
    pinching: false,
    lastX: 0,
    lastY: 0,
    lastDist: 0,
  })

  useEffect(() => {
    state.current.target.set(...target)
    invalidate()
  }, [target, invalidate])

  useEffect(() => {
    const el = gl.domElement
    if (!enabled) return

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      state.current.dragging = true
      state.current.lastX = e.clientX
      state.current.lastY = e.clientY
      el.setPointerCapture(e.pointerId)
    }

    const onPointerMove = (e: PointerEvent) => {
      const s = state.current
      if (!s.dragging || s.pinching) return
      const dx = e.clientX - s.lastX
      const dy = e.clientY - s.lastY
      s.lastX = e.clientX
      s.lastY = e.clientY
      // Grab model: finger right -> model turns right with finger
      s.theta -= dx * 0.005
      s.phi = Math.min(Math.PI * 0.48, Math.max(0.12, s.phi + dy * 0.005))
      invalidate()
    }

    const onPointerUp = (e: PointerEvent) => {
      state.current.dragging = false
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      state.current.radius = Math.min(120, Math.max(6, state.current.radius + e.deltaY * 0.04))
      invalidate()
    }

    // Pinch zoom
    let pointers = new Map<number, { x: number; y: number }>()
    const onPD = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 2) {
        state.current.pinching = true
        const pts = [...pointers.values()]
        state.current.lastDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      }
    }
    const onPM = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 2) {
        const pts = [...pointers.values()]
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
        const delta = state.current.lastDist - dist
        state.current.lastDist = dist
        state.current.radius = Math.min(120, Math.max(6, state.current.radius + delta * 0.05))
        invalidate()
      }
    }
    const onPU = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (pointers.size < 2) state.current.pinching = false
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onPD)
    el.addEventListener('pointermove', onPM)
    el.addEventListener('pointerup', onPU)
    el.addEventListener('pointercancel', onPU)

    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerUp)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onPD)
      el.removeEventListener('pointermove', onPM)
      el.removeEventListener('pointerup', onPU)
      el.removeEventListener('pointercancel', onPU)
    }
  }, [gl, enabled, invalidate])

  useFrame(() => {
    const s = state.current
    const { theta, phi, radius, target: t } = s
    const x = t.x + radius * Math.sin(phi) * Math.cos(theta)
    const y = t.y + radius * Math.cos(phi)
    const z = t.z + radius * Math.sin(phi) * Math.sin(theta)
    camera.position.set(x, y, z)
    camera.lookAt(t)
  })

  return null
}
