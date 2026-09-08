import * as THREE from "three";
import type { MaterialStyle, TextureKind } from "@/lib/bim/types";
import { textureCanvas } from "./procedural-textures";

const texCache = new Map<string, THREE.CanvasTexture>();

function mapFor(kind: TextureKind, size: number): THREE.CanvasTexture | null {
  if (kind === "smooth") return null;
  const key = `${kind}:${size}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const canvas = textureCanvas(kind, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = size >= 128 ? 4 : 2;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  texCache.set(key, tex);
  return tex;
}

const VS_DECL = `
#ifdef USE_MAP
varying vec2 vWuv;
uniform float uInvScale;
#endif
`;

const FS_DECL = `
#ifdef USE_MAP
varying vec2 vWuv;
#endif
`;

const VS_UV = `
#ifdef USE_MAP
  vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 wn = abs(mat3(modelMatrix) * objectNormal);
  float yDom = step(wn.x, wn.y) * step(wn.z, wn.y);
  float xDom = (1.0 - yDom) * step(wn.z, wn.x);
  vec2 wuv = mix(wp.xy, wp.zy, xDom);
  vWuv = mix(wuv, wp.xz, yDom) * uInvScale;
#endif
`;

const FS_MAP = `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D(map, vWuv);
  diffuseColor *= sampledDiffuseColor;
#endif
`;

function patchWorldUVs(
  shader: THREE.WebGLProgramParametersWithUniforms,
  invScale: { value: number },
) {
  shader.uniforms.uInvScale = invScale;
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${VS_DECL}`)
    .replace("#include <project_vertex>", `${VS_UV}\n#include <project_vertex>`);
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\n${FS_DECL}`)
    .replace("#include <map_fragment>", FS_MAP);
}

function attachWorldUVs(mat: THREE.Material, invScale: { value: number }) {
  mat.onBeforeCompile = (shader) => patchWorldUVs(shader, invScale);
  mat.customProgramCacheKey = () => "wm-wuv5";
  mat.userData.invScale = invScale;
}

export function createStyledMaterial(
  style: MaterialStyle,
  lambert: boolean,
  texSize: number,
): THREE.Material {
  const map = mapFor(style.texture, texSize);
  const invScale = { value: 1 / Math.max(style.scale, 0.05) };
  const common = {
    color: style.color,
    transparent: style.transparent,
    opacity: style.opacity,
    depthWrite: !style.transparent,
    map,
    precision: lambert ? ("mediump" as const) : undefined,
  };
  const glassLike = style.texture === "glass" || style.texture === "water";
  const mat = lambert
    ? new THREE.MeshLambertMaterial(common)
    : new THREE.MeshStandardMaterial({
        ...common,
        roughness: glassLike ? Math.min(style.roughness, 0.12) : style.roughness,
        metalness: glassLike ? 0.12 : style.metalness,
        envMapIntensity: glassLike || style.metalness > 0.4 ? 1.15 : 0.72,
      });
  if (map) {
    attachWorldUVs(mat, invScale);
    mat.userData.invScaleAttached = true;
  } else {
    mat.userData.invScale = invScale;
  }
  return mat;
}

export function syncMaterial(mat: THREE.Material, style: MaterialStyle, texSize: number) {
  const m = mat as THREE.MeshStandardMaterial;
  m.color.set(style.color);
  if ("roughness" in m) m.roughness = style.roughness;
  if ("metalness" in m) m.metalness = style.metalness;
  if ("envMapIntensity" in m) {
    const glassLike = style.texture === "glass" || style.texture === "water";
    m.envMapIntensity = glassLike || style.metalness > 0.4 ? 1.15 : 0.72;
  }
  m.opacity = style.opacity;
  m.transparent = style.transparent;
  m.depthWrite = !style.transparent;
  const map = mapFor(style.texture, texSize);
  if (m.map !== map) {
    m.map = map ?? null;
    m.needsUpdate = true;
  }
  if (map && !mat.userData.invScaleAttached) {
    const inv = (mat.userData.invScale as { value: number } | undefined) ?? {
      value: 1 / Math.max(style.scale, 0.05),
    };
    attachWorldUVs(mat, inv);
    mat.userData.invScaleAttached = true;
    mat.needsUpdate = true;
  }
  const u = mat.userData.invScale as { value: number } | undefined;
  if (u) u.value = 1 / Math.max(style.scale, 0.05);
}
