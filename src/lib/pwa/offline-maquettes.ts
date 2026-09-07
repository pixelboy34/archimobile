import type { Project } from "@/lib/bim/types";

const DB_NAME = "forma-offline-maquettes";
const DB_VERSION = 1;
const STORE = "maquettes";
const MAX_ENTRIES = 40;

export type OfflineMaquetteMeta = {
  id: string;
  name: string;
  savedAt: number;
  wallCount: number;
  storyCount: number;
  projectId: string;
};

type OfflineRecord = OfflineMaquetteMeta & { project: Project };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponible"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB tx failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB tx aborted"));
  });
}

function metaOf(project: Project, name: string, id: string, savedAt: number): OfflineMaquetteMeta {
  return {
    id,
    name,
    savedAt,
    wallCount: project.walls?.length ?? 0,
    storyCount: project.stories?.length ?? 0,
    projectId: project.id,
  };
}

export async function listOfflineMaquettes(): Promise<OfflineMaquetteMeta[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const rows = await new Promise<OfflineRecord[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as OfflineRecord[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    await txDone(tx);
    return rows
      .map(({ project: _p, ...meta }) => meta)
      .sort((a, b) => b.savedAt - a.savedAt);
  } finally {
    db.close();
  }
}

export async function saveOfflineMaquette(
  project: Project,
  name?: string,
): Promise<OfflineMaquetteMeta> {
  const db = await openDb();
  try {
    const label = (name ?? project.name ?? "Maquette").trim() || "Maquette";
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const savedAt = Date.now();
    const record: OfflineRecord = {
      ...metaOf(project, label, id, savedAt),
      project: structuredClone(project),
    };
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.put(record);
    const all = await new Promise<OfflineRecord[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as OfflineRecord[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    if (all.length > MAX_ENTRIES) {
      const oldest = [...all].sort((a, b) => a.savedAt - b.savedAt);
      for (const row of oldest.slice(0, all.length - MAX_ENTRIES)) {
        store.delete(row.id);
      }
    }
    await txDone(tx);
    const { project: _p, ...meta } = record;
    return meta;
  } finally {
    db.close();
  }
}

export async function loadOfflineMaquette(id: string): Promise<Project | null> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const row = await new Promise<OfflineRecord | undefined>((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result as OfflineRecord | undefined);
      req.onerror = () => reject(req.error);
    });
    await txDone(tx);
    return row?.project ?? null;
  } finally {
    db.close();
  }
}

export async function deleteOfflineMaquette(id: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    await txDone(tx);
  } finally {
    db.close();
  }
}
