import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Project } from '../../lib/bim/types'
import { wallLength, wallAngle, wallCenter } from '../../lib/bim/types'
import { useProjectStore } from '../../lib/store/project-store'

type Props = {
  project: Project
  onClose?: () => void
}

type CamStatus = 'idle' | 'requesting' | 'live' | 'denied' | 'unsupported'

const SCALE_POSER = 1 / 50

function projectBounds(project: Project) {
  let minX = 0,
    maxX = 0,
    minZ = 0,
    maxZ = 0,
    maxY = 3
  for (const w of project.walls) {
    minX = Math.min(minX, w.a.x, w.b.x)
    maxX = Math.max(maxX, w.a.x, w.b.x)
    minZ = Math.min(minZ, w.a.y, w.b.y)
    maxZ = Math.max(maxZ, w.a.y, w.b.y)
  }
  for (const s of project.stories) {
    maxY = Math.max(maxY, s.elevation + s.height)
  }
  return {
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
    w: Math.max(4, maxX - minX),
    d: Math.max(4, maxZ - minZ),
    h: maxY,
  }
}

/** Minimal USDZ (USD ASCII in a zip) for iOS Quick Look — box footprint placeholder. */
async function buildUsdzBlob(project: Project): Promise<Blob> {
  const b = projectBounds(project)
  const sx = Math.max(0.05, b.w * SCALE_POSER)
  const sy = Math.max(0.05, b.h * SCALE_POSER)
  const sz = Math.max(0.05, b.d * SCALE_POSER)
  const usda = `#usda 1.0
(
    defaultPrim = "FORMA"
    metersPerUnit = 1
    upAxis = "Y"
)

def Xform "FORMA" (
    kind = "component"
)
{
    def Cube "Maquette" {
        double size = 1
        float3 xformOp:scale = (${sx.toFixed(4)}, ${sy.toFixed(4)}, ${sz.toFixed(4)})
        uniform token[] xformOpOrder = ["xformOp:scale"]
        color3f[] primvars:displayColor = [(0.43, 0.816, 0.765)]
    }
}
`
  // Pack as uncompressed zip (USDZ = zip of .usdc/.usda)
  const name = 'model.usda'
  const data = new TextEncoder().encode(usda)
  const fileName = new TextEncoder().encode(name)
  const localHeaderSize = 30 + fileName.length
  const centralSize = 46 + fileName.length
  const buf = new ArrayBuffer(localHeaderSize + data.length + centralSize + 22)
  const view = new DataView(buf)
  const bytes = new Uint8Array(buf)
  let o = 0
  // Local file header
  view.setUint32(o, 0x04034b50, true); o += 4
  view.setUint16(o, 20, true); o += 2
  view.setUint16(o, 0, true); o += 2
  view.setUint16(o, 0, true); o += 2 // store
  view.setUint16(o, 0, true); o += 2
  view.setUint16(o, 0, true); o += 2
  view.setUint32(o, 0, true); o += 4 // crc optional 0 for store in some readers — compute
  const crc = crc32(data)
  view.setUint32(o - 4, crc, true)
  view.setUint32(o, data.length, true); o += 4
  view.setUint32(o, data.length, true); o += 4
  view.setUint16(o, fileName.length, true); o += 2
  view.setUint16(o, 0, true); o += 2
  bytes.set(fileName, o); o += fileName.length
  bytes.set(data, o); o += data.length
  const centralOffset = o
  // Central directory
  view.setUint32(o, 0x02014b50, true); o += 4
  view.setUint16(o, 20, true); o += 2
  view.setUint16(o, 20, true); o += 2
  view.setUint16(o, 0, true); o += 2
  view.setUint16(o, 0, true); o += 2
  view.setUint16(o, 0, true); o += 2
  view.setUint16(o, 0, true); o += 2
  view.setUint32(o, crc, true); o += 4
  view.setUint32(o, data.length, true); o += 4
  view.setUint32(o, data.length, true); o += 4
  view.setUint16(o, fileName.length, true); o += 2
  view.setUint16(o, 0, true); o += 2
  view.setUint16(o, 0, true); o += 2
  view.setUint16(o, 0, true); o += 2
  view.setUint16(o, 0, true); o += 2
  view.setUint32(o, 0, true); o += 4
  view.setUint32(o, 0, true); o += 4 // local header offset
  bytes.set(fileName, o); o += fileName.length
  // EOCD
  view.setUint32(o, 0x06054b50, true); o += 4
  view.setUint16(o, 0, true); o += 2
  view.setUint16(o, 0, true); o += 2
  view.setUint16(o, 1, true); o += 2
  view.setUint16(o, 1, true); o += 2
  view.setUint32(o, centralSize, true); o += 4
  view.setUint32(o, centralOffset, true); o += 4
  view.setUint16(o, 0, true)
  return new Blob([buf], { type: 'model/vnd.usdz+zip' })
}

function crc32(buf: Uint8Array): number {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  }
  return ~c >>> 0
}

function MaquetteSvg({
  project,
  yaw,
  pitch,
  scale,
  measure,
}: {
  project: Project
  yaw: number
  pitch: number
  scale: number
  measure: { a: { x: number; y: number } | null; b: { x: number; y: number } | null }
}) {
  const b = useMemo(() => projectBounds(project), [project])
  const walls = project.walls.slice(0, 200)

  return (
    <svg
      viewBox="-60 -50 120 100"
      className="w-full h-full"
      style={{
        transform: `perspective(600px) rotateX(${12 + pitch * 40}deg) rotateY(${yaw * 57.3}deg) scale(${scale})`,
        transformOrigin: '50% 60%',
        transition: 'transform 0.05s linear',
      }}
    >
      <rect
        x={-b.w / 2}
        y={-b.d / 2}
        width={b.w}
        height={b.d}
        fill="#1a2a22"
        stroke="#6ed0c3"
        strokeWidth={0.15}
        opacity={0.85}
        transform={`translate(${-b.cx}, ${-b.cz})`}
      />
      {walls.map((w) => {
        const len = wallLength(w)
        const ang = wallAngle(w)
        const c = wallCenter(w)
        return (
          <rect
            key={w.id}
            x={-len / 2}
            y={-w.thickness / 2}
            width={len}
            height={w.thickness}
            fill="#e8e4dc"
            opacity={0.9}
            transform={`translate(${c.x - b.cx}, ${c.y - b.cz}) rotate(${(ang * 180) / Math.PI})`}
          />
        )
      })}
      {measure.a && (
        <circle cx={measure.a.x} cy={measure.a.y} r={0.35} fill="#6ed0c3" />
      )}
      {measure.b && (
        <circle cx={measure.b.x} cy={measure.b.y} r={0.35} fill="#6ed0c3" />
      )}
      {measure.a && measure.b && (
        <line
          x1={measure.a.x}
          y1={measure.a.y}
          x2={measure.b.x}
          y2={measure.b.y}
          stroke="#6ed0c3"
          strokeWidth={0.2}
        />
      )}
    </svg>
  )
}

export default function ArView({ project }: Props) {
  const arMode = useProjectStore((s) => s.arMode)
  const setArMode = useProjectStore((s) => s.setArMode)
  const setView = useProjectStore((s) => s.setView)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [camStatus, setCamStatus] = useState<CamStatus>('idle')
  const [yaw, setYaw] = useState(0.4)
  const [pitch, setPitch] = useState(0.15)
  const [xrSupported, setXrSupported] = useState(false)
  const [xrMessage, setXrMessage] = useState<string | null>(null)
  const [iosHint, setIosHint] = useState(false)
  const [measureDist, setMeasureDist] = useState<number | null>(null)
  const [measurePts, setMeasurePts] = useState<{
    a: { x: number; y: number } | null
    b: { x: number; y: number } | null
  }>({ a: null, b: null })

  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const xr = (navigator as Navigator & { xr?: { isSessionSupported?: (m: string) => Promise<boolean> } }).xr
    if (xr?.isSessionSupported) {
      xr.isSessionSupported('immersive-ar')
        .then((ok) => setXrSupported(!!ok))
        .catch(() => setXrSupported(false))
    }
    const ua = navigator.userAgent
    setIosHint(/iPad|iPhone|iPod/.test(ua))
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamStatus('unsupported')
      return
    }
    setCamStatus('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => undefined)
      }
      setCamStatus('live')
    } catch {
      setCamStatus('denied')
    }
  }, [])

  useEffect(() => {
    void startCamera()
    return () => stopCamera()
  }, [startCamera, stopCamera])

  // Device orientation when camera live
  useEffect(() => {
    if (camStatus !== 'live') return
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.alpha != null) setYaw(((e.alpha - 180) * Math.PI) / 180)
      if (e.beta != null) setPitch(Math.min(0.6, Math.max(-0.2, ((e.beta - 45) * Math.PI) / 180 / 2)))
    }
    window.addEventListener('deviceorientation', onOrient)
    return () => window.removeEventListener('deviceorientation', onOrient)
  }, [camStatus])

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, yaw, pitch }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x
    const dy = e.clientY - drag.current.y
    setYaw(drag.current.yaw + dx * 0.005)
    setPitch(Math.min(0.8, Math.max(-0.3, drag.current.pitch + dy * 0.004)))
  }
  const onPointerUp = () => {
    drag.current = null
  }

  const onOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (arMode !== 'cote') return
    const el = overlayRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    // Map click to SVG viewBox-ish coords roughly
    const x = ((e.clientX - rect.left) / rect.width) * 120 - 60
    const y = ((e.clientY - rect.top) / rect.height) * 100 - 50
    setMeasurePts((prev) => {
      if (!prev.a || (prev.a && prev.b)) {
        setMeasureDist(null)
        return { a: { x, y }, b: null }
      }
      const bpt = { x, y }
      const distM = Math.hypot(bpt.x - prev.a.x, bpt.y - prev.a.y) // SVG units ≈ meters in our mapping
      setMeasureDist(Math.round(distM * 100) / 100)
      return { a: prev.a, b: bpt }
    })
  }

  const startWebXr = async () => {
    const nav = navigator as Navigator & {
      xr?: { requestSession: (m: string, init?: object) => Promise<{ end: () => Promise<void>; addEventListener: (e: string, fn: () => void) => void }> }
    }
    if (!nav.xr) {
      setXrMessage('WebXR indisponible sur cet appareil.')
      return
    }
    try {
      const session = await nav.xr.requestSession('immersive-ar', {
        requiredFeatures: ['local-floor'],
        optionalFeatures: ['dom-overlay', 'hit-test'],
      })
      setXrMessage('Session AR demarree — placez la maquette (session native).')
      session.addEventListener('end', () => setXrMessage(null))
      // Without a full WebGL XR loop we end quickly with a clear message
      await session.end()
      setXrMessage(
        'WebXR detecte. Pour une session immersive complete, utilisez un navigateur AR compatible. Mode camera / viewer actif ci-dessous.',
      )
    } catch {
      setXrMessage('Impossible de demarrer WebXR. Utilisez le mode camera ou le viewer.')
    }
  }

  const downloadUsdz = async () => {
    const blob = await buildUsdzBlob(project)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.meta.name.replace(/[^\w\-]+/g, '_').slice(0, 40) || 'forma'}.usdz`
    a.rel = 'ar'
    a.click()
    URL.revokeObjectURL(url)
  }

  const viewerOnly = camStatus === 'denied' || camStatus === 'unsupported'
  const scale = arMode === 'poser' ? 1.15 : 1

  return (
    <div className="absolute inset-0 z-[15] bg-[#04080c] overflow-hidden">
      {!viewerOnly && (
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
          autoPlay
        />
      )}
      {viewerOnly && (
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a1218] to-[#04080c]" />
      )}

      <div
        ref={overlayRef}
        className="absolute inset-0 flex items-center justify-center touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onOverlayClick}
      >
        <div className="w-[min(90vw,28rem)] h-[min(55vh,22rem)] pointer-events-none opacity-95">
          <MaquetteSvg
            project={project}
            yaw={yaw}
            pitch={pitch}
            scale={scale}
            measure={measurePts}
          />
        </div>
      </div>

      <div className="absolute top-[4.5rem] left-0 right-0 z-20 flex flex-col items-center gap-2 px-3 pointer-events-none">
        <div className="pointer-events-auto flex gap-1 flex-wrap justify-center">
          <button
            type="button"
            className="chip"
            data-active={arMode === 'poser'}
            onClick={() => setArMode('poser')}
          >
            Poser 1:50
          </button>
          <button
            type="button"
            className="chip"
            data-active={arMode === 'cote'}
            onClick={() => {
              setArMode('cote')
              setMeasurePts({ a: null, b: null })
              setMeasureDist(null)
            }}
          >
            Cote
          </button>
          {xrSupported && (
            <button type="button" className="chip" onClick={() => void startWebXr()}>
              WebXR
            </button>
          )}
          {iosHint && (
            <button type="button" className="chip" onClick={() => void downloadUsdz()}>
              Quick Look USDZ
            </button>
          )}
          <button type="button" className="chip" onClick={() => setView('3d')}>
            Quitter AR
          </button>
        </div>

        {viewerOnly && (
          <p className="pointer-events-auto chip text-xs max-w-[92vw] text-center bg-[#0a1218]/95">
            {camStatus === 'denied'
              ? 'Camera refusee — mode viewer actif. Glissez pour regarder la maquette.'
              : 'Camera indisponible — mode viewer. Glissez pour orienter la maquette.'}
          </p>
        )}
        {camStatus === 'live' && (
          <p className="chip text-[11px] text-[#7a8f9c] bg-[#0a1218]/85">
            {arMode === 'poser'
              ? 'Poser : maquette echelle 1:50. Orientez l appareil ou glissez.'
              : 'Cote : touchez deux points pour mesurer une distance.'}
          </p>
        )}
        {camStatus === 'requesting' && (
          <p className="chip text-xs">Autorisation camera…</p>
        )}
        {xrMessage && (
          <p className="pointer-events-auto chip text-xs max-w-[92vw] text-center">{xrMessage}</p>
        )}
        {arMode === 'cote' && measureDist != null && (
          <p className="chip font-mono text-sm text-[#6ed0c3]">
            Distance ≈ {measureDist.toFixed(2)} m
          </p>
        )}
      </div>
    </div>
  )
}
