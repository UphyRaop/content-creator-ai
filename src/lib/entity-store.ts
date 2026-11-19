import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export const entityCollections = ["characters", "locations", "series", "brandKits", "channels", "voices"] as const;
export type EntityCollection = typeof entityCollections[number];
export type Entity = { id: string; name: string; [key: string]: unknown };
const globalStore = globalThis as typeof globalThis & { ccaiEntityDb?: DatabaseSync };

function database() {
  if (globalStore.ccaiEntityDb) return globalStore.ccaiEntityDb;
  const filename = process.env.CCAI_DATABASE_PATH || resolve(process.cwd(), "data", "ccai.sqlite");
  if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;");
  db.exec(`CREATE TABLE IF NOT EXISTS workspace_entities (
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(collection,id)
  )`);
  const columns=db.prepare("PRAGMA table_info(workspace_entities)").all() as Array<{name:string}>;
  if(!columns.some(column=>column.name==="owner_id"))db.exec("ALTER TABLE workspace_entities ADD COLUMN owner_id TEXT");
  db.exec("CREATE INDEX IF NOT EXISTS workspace_entities_owner_id_idx ON workspace_entities(owner_id)");
  globalStore.ccaiEntityDb = db;
  return db;
}

export function validateEntity(value: unknown): value is Entity {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entity = value as Record<string, unknown>;
  if (typeof entity.id !== "string" || entity.id.length > 100 || typeof entity.name !== "string" || !entity.name.trim() || entity.name.length > 120) return false;
  const json = JSON.stringify(entity);
  if (json.length > 40_000_000) return false;
  const refs = entity.referenceImages;
  if (refs !== undefined && (!Array.isArray(refs) || refs.length > 12 || refs.some((item) => !item || typeof item !== "object" || typeof (item as Record<string, unknown>).dataUrl !== "string" || !/^data:image\/(png|jpeg|webp|gif);base64,/i.test(String((item as Record<string, unknown>).dataUrl)) || String((item as Record<string, unknown>).dataUrl).length > 2_800_000))) return false;
  if (entity.type !== undefined && entity.type !== "narrator" && entity.type !== "character") return false;
  for (const key of ["speed", "stability", "similarity", "styleExaggeration"]) {
    if (entity[key] !== undefined && (!Number.isFinite(Number(entity[key])) || Number(entity[key]) < (key === "speed" ? 0.5 : 0) || Number(entity[key]) > (key === "speed" ? 2 : 1))) return false;
  }
  for (const key of ["language", "style", "emotion", "voiceId", "pronunciation", "characterId"]) {
    if (entity[key] !== undefined && (typeof entity[key] !== "string" || entity[key].length > 5000)) return false;
  }
  return true;
}

function validCollection(collection: string): collection is EntityCollection {
  return (entityCollections as readonly string[]).includes(collection);
}
export function listEntities(collection: string,ownerId?:string): Entity[] {
  if (!validCollection(collection)) throw new Error("Unknown collection.");
  return (ownerId===undefined?database().prepare("SELECT data FROM workspace_entities WHERE collection=? ORDER BY name COLLATE NOCASE").all(collection):database().prepare("SELECT data FROM workspace_entities WHERE collection=? AND owner_id=? ORDER BY name COLLATE NOCASE").all(collection,ownerId))
    .map((row) => JSON.parse(String((row as { data: unknown }).data)) as Entity);
}
export function saveEntity(collection: string, value: unknown,ownerId:string|null=null): Entity {
  if (!validCollection(collection) || !validateEntity(value)) throw new Error("Invalid library record.");
  const entity = value;
  const result=database().prepare("INSERT INTO workspace_entities(collection,id,name,data,updated_at,owner_id) VALUES(?,?,?,?,?,?) ON CONFLICT(collection,id) DO UPDATE SET name=excluded.name,data=excluded.data,updated_at=excluded.updated_at WHERE workspace_entities.owner_id IS excluded.owner_id")
    .run(collection, entity.id, entity.name.trim(), JSON.stringify(entity), new Date().toISOString(),ownerId);
  if(!Number(result.changes))throw new Error("Library record not found.");
  return entity;
}
export function deleteEntity(collection: string, id: string,ownerId?:string): boolean {
  if (!validCollection(collection)) throw new Error("Unknown collection.");
  return Number((ownerId===undefined?database().prepare("DELETE FROM workspace_entities WHERE collection=? AND id=?").run(collection,id):database().prepare("DELETE FROM workspace_entities WHERE collection=? AND id=? AND owner_id=?").run(collection,id,ownerId)).changes) > 0;
}
export function duplicateEntity(collection: string, id: string,ownerId:string|null=null): Entity | null {
  const source = listEntities(collection,ownerId===null?undefined:ownerId).find((item) => item.id === id);
  if (!source) return null;
  const copy = { ...source, id: randomUUID(), name: `Copy of ${source.name}` };
  return saveEntity(collection, copy,ownerId);
}
