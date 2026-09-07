/**
 * In-memory WebRTC signaling relay for /api/rtc.
 * Roster + SDP/ICE only — game/project data flows peer-to-peer after connect.
 * Survives Vite HMR via globalThis. Peer TTL ~45s, signal TTL ~60s.
 */
import { z } from "zod";
import type { PeerRow, RtcPollResponse, SignalKind, SignalRow } from "./p2p";

const ID = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);

const signalSchema = z.object({
  op: z.literal("signal"),
  room: ID,
  from: ID,
  to: ID,
  kind: z.enum(["offer", "answer", "ice"]),
  payload: z.unknown().refine(
    (v) => v !== undefined && JSON.stringify(v).length <= 32_768,
    { message: "payload too large" },
  ),
});

const leaveSchema = z.object({
  op: z.literal("leave"),
  room: ID,
  peer: ID,
});

const joinSchema = z.object({
  op: z.literal("join"),
  room: ID,
  peer: ID,
  name: z.string().max(64).optional(),
});

const postSchema = z.discriminatedUnion("op", [signalSchema, leaveSchema, joinSchema]);

const PEER_TTL_MS = 45_000;
const SIGNAL_TTL_MS = 60_000;

interface MemPeer {
  id: string;
  name: string;
  lastSeen: number;
}

interface MemSignal {
  id: number;
  from: string;
  to: string;
  kind: SignalKind;
  payload: unknown;
  createdAt: number;
}

interface MemRoom {
  peers: Map<string, MemPeer>;
  signals: MemSignal[];
  nextId: number;
}

type Store = Map<string, MemRoom>;

const globalRef = globalThis as typeof globalThis & {
  __formaRtcStore__?: Store;
};

function store(): Store {
  if (!globalRef.__formaRtcStore__) globalRef.__formaRtcStore__ = new Map();
  return globalRef.__formaRtcStore__;
}

function roomOf(roomId: string): MemRoom {
  const s = store();
  let r = s.get(roomId);
  if (!r) {
    r = { peers: new Map(), signals: [], nextId: 1 };
    s.set(roomId, r);
  }
  return r;
}

function prune(room: MemRoom, now = Date.now()): void {
  for (const [id, p] of room.peers) {
    if (now - p.lastSeen > PEER_TTL_MS) room.peers.delete(id);
  }
  room.signals = room.signals.filter((sig) => now - sig.createdAt <= SIGNAL_TTL_MS);
  // Drop empty rooms from the global map opportunistically
}

function touchPeer(room: MemRoom, peer: string, name: string): void {
  const existing = room.peers.get(peer);
  room.peers.set(peer, {
    id: peer,
    name: name || existing?.name || "",
    lastSeen: Date.now(),
  });
}

function roster(room: MemRoom): PeerRow[] {
  return [...room.peers.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, 32)
    .map((p) => ({ id: p.id, name: p.name }));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

/** GET /api/rtc?room&peer&name&since — join (heartbeat), roster, inbox. */
async function handleGet(url: URL): Promise<Response> {
  const parsed = z
    .object({
      room: ID,
      peer: ID,
      name: z.string().max(64).default(""),
      since: z.coerce.number().int().min(0).default(0),
    })
    .safeParse({
      room: url.searchParams.get("room"),
      peer: url.searchParams.get("peer"),
      name: url.searchParams.get("name") ?? "",
      since: url.searchParams.get("since") ?? "0",
    });
  if (!parsed.success) return json({ error: "invalid query" }, 400);
  const { room: roomId, peer, name, since } = parsed.data;

  const room = roomOf(roomId);
  prune(room);
  touchPeer(room, peer, name);

  const signals: SignalRow[] = room.signals
    .filter((s) => s.to === peer && s.id > since)
    .slice(0, 200)
    .map((s) => ({ id: s.id, from: s.from, kind: s.kind, payload: s.payload }));

  const body: RtcPollResponse = { peers: roster(room), signals };
  return json(body);
}

async function handlePost(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid request" }, 400);
  const msg = parsed.data;
  const room = roomOf(msg.room);
  prune(room);

  if (msg.op === "signal") {
    room.signals.push({
      id: room.nextId++,
      from: msg.from,
      to: msg.to,
      kind: msg.kind,
      payload: msg.payload,
      createdAt: Date.now(),
    });
    // Heartbeat sender so dialer stays in roster while negotiating
    touchPeer(room, msg.from, room.peers.get(msg.from)?.name ?? "");
  } else if (msg.op === "leave") {
    room.peers.delete(msg.peer);
  } else {
    // join
    touchPeer(room, msg.peer, msg.name ?? "");
  }
  return json({ ok: true });
}

/** Request entrypoint for the /api/rtc route (GET poll, POST join/leave/signal). */
export async function handleSignaling(request: Request): Promise<Response> {
  try {
    if (request.method === "GET") return await handleGet(new URL(request.url));
    if (request.method === "POST") return await handlePost(request);
    return json({ error: "method not allowed" }, 405);
  } catch (error) {
    console.error("[rtc] signaling error:", error);
    return json({ error: "signaling failed" }, 500);
  }
}
