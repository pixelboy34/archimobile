import { uid } from "../utils";
import type { Project, Story } from "../bim/types";
import { restackStories } from "./ops";

export type StoryRole = NonNullable<Story["role"]>;

export function isLiveTypical(st: Story | undefined | null): boolean {
  return !!st && st.role === "typical" && !st.detached && !!st.typicalGroup;
}

export function typicalGroupMembers(p: Project, groupId: string | undefined): Story[] {
  if (!groupId) return [];
  return p.stories.filter((s) => s.role === "typical" && s.typicalGroup === groupId && !s.detached);
}

export function typicalGroupSize(p: Project, storyId: string | null | undefined): number {
  const st = p.stories.find((s) => s.id === storyId);
  if (!st?.typicalGroup) return 0;
  return typicalGroupMembers(p, st.typicalGroup).length;
}

export function linkedTypicalHint(p: Project, storyId: string | null | undefined): string | null {
  const n = typicalGroupSize(p, storyId);
  const st = p.stories.find((s) => s.id === storyId);
  if (!st || !isLiveTypical(st) || n <= 1) return null;
  return `Édition → ${n} étages types`;
}

function sharedTypicalGroupId(p: Project): string {
  const existing = p.stories.find((s) => s.typicalGroup)?.typicalGroup;
  return existing ?? "typ_1";
}

/** Infer roles/groups for projects saved before étage type vivant. */
export function inferStoryRoles(p: Project): Project {
  if (!p.stories.length) return p;
  const allHaveRole = p.stories.every((s) => !!s.role);
  if (allHaveRole) {
    // Ensure typicals share a group id when missing
    const group = sharedTypicalGroupId(p);
    let changed = false;
    p.stories = p.stories.map((s) => {
      if (s.role !== "typical") return s;
      if (s.typicalGroup) return s;
      changed = true;
      return { ...s, typicalGroup: group };
    });
    return changed ? p : p;
  }

  const basementFlags = p.stories.map(
    (s) => s.elevation < -0.1 || /^ss/i.test(s.name),
  );
  const lastIdx = p.stories.length - 1;
  const last = p.stories[lastIdx]!;
  const lastHasRoof = p.roofs.some((r) => r.storyId === last.id);
  const lastIsAttic =
    lastHasRoof || /attique|comble/i.test(last.name);

  let firstNonBasement = -1;
  for (let i = 0; i < p.stories.length; i++) {
    if (!basementFlags[i]) {
      firstNonBasement = i;
      break;
    }
  }

  const group = "typ_1";
  p.stories = p.stories.map((st, i) => {
    if (basementFlags[i]) {
      return { ...st, role: "basement" as const, typicalGroup: undefined, detached: undefined };
    }
    if (i === firstNonBasement) {
      return { ...st, role: "ground" as const, typicalGroup: undefined, detached: undefined };
    }
    if (i === lastIdx && lastIsAttic && i !== firstNonBasement) {
      return { ...st, role: "attic" as const, typicalGroup: undefined, detached: undefined };
    }
    return { ...st, role: "typical" as const, typicalGroup: group };
  });
  return p;
}

/** Assign roles after fresh massing: RDC=ground, SS=basement, rest=typical (incl. last with roof). */
export function assignMassingRoles(p: Project): Project {
  const group = "typ_1";
  p.stories = p.stories.map((st) => {
    if (st.elevation < -0.1 || /^ss/i.test(st.name)) {
      return { ...st, role: "basement" as const, typicalGroup: undefined, detached: false };
    }
    if (/^rdc$/i.test(st.name) || st.elevation === 0) {
      // First non-basement named RDC
      return { ...st, role: "ground" as const, typicalGroup: undefined, detached: false };
    }
    return { ...st, role: "typical" as const, typicalGroup: group, detached: false };
  });
  // Guarantee exactly one ground: first non-basement
  let groundSet = false;
  p.stories = p.stories.map((st) => {
    if (st.role === "basement") return st;
    if (!groundSet) {
      groundSet = true;
      return { ...st, role: "ground" as const, typicalGroup: undefined, detached: false };
    }
    return { ...st, role: "typical" as const, typicalGroup: group, detached: false };
  });
  return p;
}

/** Copy walls/openings/rooms/columns/slabs/stairs/furniture from src → dest; keep dest roofs. */
export function copyStoryGeometry(p: Project, fromId: string, toId: string): Project {
  const src = p.stories.find((s) => s.id === fromId);
  const dest = p.stories.find((s) => s.id === toId);
  if (!src || !dest || fromId === toId) return p;

  const srcWalls = p.walls.filter((w) => w.storyId === fromId);
  const srcOpenings = p.openings.filter((o) => srcWalls.some((w) => w.id === o.wallId));
  const srcRooms = p.rooms.filter((r) => r.storyId === fromId);
  const srcCols = p.columns.filter((c) => c.storyId === fromId);
  const srcFurn = p.furniture.filter((f) => f.storyId === fromId);
  const srcStairs = p.stairs.filter((s) => s.storyId === fromId);
  const srcSlabs = p.slabs.filter((s) => s.storyId === fromId);
  const keepRoof = p.roofs.filter((r) => r.storyId === toId);

  p.walls = p.walls.filter((w) => w.storyId !== toId);
  p.rooms = p.rooms.filter((r) => r.storyId !== toId);
  p.columns = p.columns.filter((c) => c.storyId !== toId);
  p.furniture = p.furniture.filter((f) => f.storyId !== toId);
  p.stairs = p.stairs.filter((s) => s.storyId !== toId);
  p.slabs = p.slabs.filter((s) => s.storyId !== toId);
  p.openings = p.openings.filter((o) => p.walls.some((w) => w.id === o.wallId));
  p.roofs = p.roofs.filter((r) => r.storyId !== toId).concat(keepRoof);

  const wallMap = new Map<string, string>();
  for (const w of srcWalls) {
    const nid = uid("w");
    wallMap.set(w.id, nid);
    p.walls.push({ ...w, id: nid, storyId: toId, height: dest.height });
  }
  for (const o of srcOpenings) {
    const wid = wallMap.get(o.wallId);
    if (wid) p.openings.push({ ...o, id: uid("op"), wallId: wid });
  }
  for (const r of srcRooms) p.rooms.push({ ...r, id: uid("rm"), storyId: toId });
  for (const c of srcCols) p.columns.push({ ...c, id: uid("col"), storyId: toId, height: dest.height });
  for (const f of srcFurn) p.furniture.push({ ...f, id: uid("fur"), storyId: toId });
  for (const s of srcStairs) p.stairs.push({ ...s, id: uid("stai"), storyId: toId, rise: dest.height });
  for (const s of srcSlabs) p.slabs.push({ ...s, id: uid("sl"), storyId: toId });
  return p;
}

/**
 * Live sync: push geometry (and optionally height) from a linked typical to siblings
 * in the same typicalGroup. Skips ground / basement / attic / detached.
 */
export function syncTypicalFrom(
  p: Project,
  fromId: string,
  opts?: { syncHeight?: boolean },
): Project {
  let next = inferStoryRoles(p);
  const src = next.stories.find((s) => s.id === fromId);
  if (!isLiveTypical(src)) return next;
  const members = typicalGroupMembers(next, src!.typicalGroup);
  if (members.length <= 1) return next;

  if (opts?.syncHeight) {
    next.stories = next.stories.map((s) =>
      s.id !== fromId && s.typicalGroup === src!.typicalGroup && s.role === "typical" && !s.detached
        ? { ...s, height: src!.height }
        : s,
    );
    next = restackStories(next);
  }

  for (const st of members) {
    if (st.id === fromId) continue;
    next = copyStoryGeometry(next, fromId, st.id);
  }
  return next;
}

/**
 * One-shot propagate into the typical group only.
 * Skips basement / attic / detached by default (exceptions).
 * Source may be RDC, detached, or a typical — overwrites linked types.
 */
export function propagateIntoTypicalGroup(project: Project, fromId: string): Project {
  let p = inferStoryRoles(project);
  const src = p.stories.find((s) => s.id === fromId);
  if (!src) return p;

  const group = sharedTypicalGroupId(p);
  // Ensure there is a typical group to receive the layout
  const receivers = p.stories.filter((s) => {
    if (s.id === fromId) return false;
    if (s.role === "basement" || s.role === "attic") return false;
    if (s.detached) return false;
    if (s.role === "ground") return false;
    return true;
  });

  // Mark receivers as typical in the shared group if they lack role
  p.stories = p.stories.map((s) => {
    if (receivers.some((r) => r.id === s.id)) {
      return { ...s, role: "typical" as const, typicalGroup: group, detached: false };
    }
    // If source is typical without group, join
    if (s.id === fromId && s.role === "typical" && !s.typicalGroup) {
      return { ...s, typicalGroup: group };
    }
    return s;
  });

  const targets = p.stories.filter(
    (s) =>
      s.id !== fromId &&
      s.role === "typical" &&
      !s.detached &&
      (s.typicalGroup === group || !s.typicalGroup),
  );

  for (const st of targets) {
    p = copyStoryGeometry(p, fromId, st.id);
  }
  return restackStories(p);
}

export function setStoryDetached(p: Project, id: string, detached: boolean): Project {
  p = inferStoryRoles(p);
  p.stories = p.stories.map((s) => {
    if (s.id !== id) return s;
    if (detached) return { ...s, detached: true };
    // Relink: ensure typical + group
    const group = s.typicalGroup ?? sharedTypicalGroupId(p);
    return {
      ...s,
      detached: false,
      role: s.role === "ground" || s.role === "basement" || s.role === "attic" ? s.role : "typical",
      typicalGroup: s.role === "ground" || s.role === "basement" || s.role === "attic" ? undefined : group,
    };
  });
  return p;
}

export function markStoryRole(p: Project, id: string, role: StoryRole): Project {
  p = inferStoryRoles(p);
  const group = sharedTypicalGroupId(p);
  p.stories = p.stories.map((s) => {
    if (s.id !== id) {
      // Only one ground / prefer clearing other grounds when marking RDC
      if (role === "ground" && s.role === "ground") {
        return { ...s, role: "typical" as const, typicalGroup: group, detached: false };
      }
      return s;
    }
    if (role === "typical") {
      return { ...s, role, typicalGroup: group, detached: false };
    }
    if (role === "attic" || role === "ground" || role === "basement") {
      return { ...s, role, typicalGroup: undefined, detached: false };
    }
    return { ...s, role };
  });
  return p;
}

/** Fields used when creating a new story cloned from `src`. */
export function inheritTypicalFields(src: Story, p: Project): Pick<Story, "role" | "typicalGroup" | "detached"> {
  if (src.role === "typical" && src.typicalGroup) {
    return { role: "typical", typicalGroup: src.typicalGroup, detached: false };
  }
  if (src.role === "ground" || !src.role) {
    return { role: "typical", typicalGroup: sharedTypicalGroupId(p), detached: false };
  }
  // basement / attic copies become typical in the shared group
  return { role: "typical", typicalGroup: sharedTypicalGroupId(p), detached: false };
}
