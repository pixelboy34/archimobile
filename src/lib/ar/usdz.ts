import * as THREE from "three";
import { USDZExporter } from "three/examples/jsm/exporters/USDZExporter.js";
import type { Project } from "@/lib/bim/types";
import { ghostParts } from "./parts";

export async function exportUsdz(project: Project, storyId?: string | null): Promise<Blob> {
  const group = new THREE.Group();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cache = new Map<string, THREE.MeshStandardMaterial>();
  for (const p of ghostParts(project, storyId)) {
    let mat = cache.get(p.color);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.72, metalness: 0.02 });
      cache.set(p.color, mat);
    }
    const mesh = new THREE.Mesh(box, mat);
    mesh.position.set(...p.pos);
    mesh.rotation.set(...p.rot);
    mesh.scale.set(...p.scale);
    group.add(mesh);
  }
  const exporter = new USDZExporter();
  const buffer = await exporter.parseAsync(group);
  box.dispose();
  for (const m of cache.values()) m.dispose();
  return new Blob([buffer as BlobPart], { type: "model/vnd.usdz+zip" });
}

export function openQuickLook(blob: Blob, name: string) {
  const file = new File([blob], `${name.replace(/\s+/g, "-")}.usdz`, {
    type: "model/vnd.usdz+zip",
  });
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.rel = "ar";
  a.download = file.name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
