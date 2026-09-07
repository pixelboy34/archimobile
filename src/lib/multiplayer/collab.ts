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

export type CollabProjectMessage = { type: "project"; project: Project };

export interface CollabSessionOptions {
  room: string;
  selfId: string;
  name?: string;
  onPeers?: (peers: PeerInfo[]) => void;
  onProject?: (project: Project, from: string) => void;
  /** Debounce for outbound snapshots (ms). Default 600. */
  debounceMs?: number;
}

export interface CollabSession {
  room: string;
  selfId: string;
  start: () => Promise<void>;
  stop: () => void;
  pushProject: (project: Project) => void;
  /** Debounced send — coalesces rapid edits. */
  pushProjectDebounced: (project: Project) => void;
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

  const p2p = new P2PRoom({
    room: opts.room,
    selfId: opts.selfId,
    name: opts.name,
    onPeersChanged: opts.onPeers,
    onMessage: (from, data, channel) => {
      if (channel !== "reliable") return;
      if (!isProjectMessage(data)) return;
      opts.onProject?.(data.project, from);
    },
  });

  const flush = () => {
    debounceTimer = null;
    if (!pending) return;
    const project = pending;
    pending = null;
    p2p.send({ type: "project", project } satisfies CollabProjectMessage);
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
    pushProject: (project) => {
      p2p.send({ type: "project", project } satisfies CollabProjectMessage);
    },
    pushProjectDebounced: (project) => {
      pending = project;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flush, debounceMs);
    },
    peerList: () => p2p.peerList(),
    connectedPeerCount: () =>
      p2p.peerList().filter((p) => p.connectionState === "connected").length,
  };
}
