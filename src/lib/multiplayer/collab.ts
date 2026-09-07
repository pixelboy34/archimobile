/**
 * Collab session — wraps P2PRoom for FORMA project snapshots over the reliable channel.
 */
import type { Project } from "@/lib/bim/types";
import { P2PRoom, type PeerInfo } from "./p2p";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeRoomCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)]!;
  }
  return code;
}

export function normalizeRoomCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

export type CollabProjectMessage = {
  type: "project";
  project: Project;
  /** Sender's local epoch (monotonic while in the room). */
  epoch?: number;
};

export interface CollabSessionOptions {
  room: string;
  selfId: string;
  name?: string;
  onPeers?: (peers: PeerInfo[]) => void;
  onProject?: (project: Project, from: string, epoch: number) => void;
  /** Debounce for outbound snapshots (ms). Default 600. */
  debounceMs?: number;
}

export interface CollabSession {
  room: string;
  selfId: string;
  start: () => Promise<void>;
  stop: () => void;
  pushProject: (project: Project, epoch?: number) => void;
  /** Debounced send — coalesces rapid edits. */
  pushProjectDebounced: (project: Project, epoch?: number) => void;
  peerList: () => PeerInfo[];
  connectedPeerCount: () => number;
}

function isProjectMessage(data: unknown): data is CollabProjectMessage {
  if (!data || typeof data !== "object") return false;
  const m = data as { type?: unknown; project?: unknown };
  return m.type === "project" && !!m.project && typeof m.project === "object";
}

export function createCollabSession(opts: CollabSessionOptions): CollabSession {
  const debounceMs = opts.debounceMs ?? 600;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pending: Project | null = null;
  let pendingEpoch = 0;

  const p2p = new P2PRoom({
    room: opts.room,
    selfId: opts.selfId,
    name: opts.name,
    onPeersChanged: opts.onPeers,
    onMessage: (from, data, channel) => {
      if (channel !== "reliable") return;
      if (!isProjectMessage(data)) return;
      const epoch = typeof data.epoch === "number" ? data.epoch : 0;
      opts.onProject?.(data.project, from, epoch);
    },
  });

  const flush = () => {
    debounceTimer = null;
    if (!pending) return;
    const project = pending;
    const epoch = pendingEpoch;
    pending = null;
    p2p.send({ type: "project", project, epoch } satisfies CollabProjectMessage);
  };

  return {
    room: opts.room,
    selfId: opts.selfId,
    start: () => p2p.join(),
    stop: () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = null;
      pending = null;
      p2p.close();
    },
    pushProject: (project, epoch = 0) => {
      p2p.send({ type: "project", project, epoch } satisfies CollabProjectMessage);
    },
    pushProjectDebounced: (project, epoch = 0) => {
      pending = project;
      pendingEpoch = epoch;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flush, debounceMs);
    },
    peerList: () => p2p.peerList(),
    connectedPeerCount: () =>
      p2p.peerList().filter((p) => p.connectionState === "connected").length,
  };
}
