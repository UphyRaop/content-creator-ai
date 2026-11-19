import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export type ProjectPayload = Record<string, unknown>;
export type ProjectRow = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  payload: ProjectPayload;
};

const globalStore = globalThis as typeof globalThis & { ccaiDb?: DatabaseSync };

function database() {
  if (globalStore.ccaiDb) return globalStore.ccaiDb;
  const filename = process.env.CCAI_DATABASE_PATH || resolve(process.cwd(), "data", "ccai.sqlite");
  if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;");
  db.exec(`CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    payload TEXT NOT NULL
  )`);
  globalStore.ccaiDb = db;
  return db;
}

function parseRow(row: Record<string, unknown>): ProjectRow {
  return {
    id: String(row.id),
    title: String(row.title),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    payload: JSON.parse(String(row.payload)) as ProjectPayload,
  };
}

export function listProjects() {
  return database().prepare("SELECT id,title,created_at,updated_at,CAST(COALESCE(json_extract(payload,'$.step'),0) AS INTEGER) AS step,COALESCE(json_extract(payload,'$.projectStatus'),'Draft') AS project_status,CAST(COALESCE(json_extract(payload,'$.priority'),3) AS INTEGER) AS priority,COALESCE(json_extract(payload,'$.seriesId'),'') AS series_id,COALESCE(json_extract(payload,'$.channelId'),'') AS channel_id,COALESCE(json_extract(payload,'$.brandKitId'),'') AS brand_kit_id FROM projects ORDER BY updated_at DESC").all()
    .map((row) => ({
      id: String(row.id), title: String(row.title),
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
      step: Number(row.step),
      status: String(row.project_status), priority: Number(row.priority),
      seriesId: String(row.series_id), channelId: String(row.channel_id), brandKitId: String(row.brand_kit_id),
    }));
}

export function getProject(id: string): ProjectRow | null {
  const row = database().prepare("SELECT * FROM projects WHERE id = ?").get(id);
  return row ? parseRow(row as Record<string, unknown>) : null;
}

export function createProject(title: string, payload: ProjectPayload = {}) {
  const cleanTitle = title.trim();
  if (!cleanTitle || cleanTitle.length > 120) throw new Error("Project title must contain 1–120 characters.");
  const now = new Date().toISOString();
  const id = randomUUID();
  database().prepare("INSERT INTO projects(id,title,created_at,updated_at,payload) VALUES(?,?,?,?,?)")
    .run(id, cleanTitle, now, now, JSON.stringify(payload));
  return getProject(id)!;
}

export function updateProject(id: string, values: { title?: string; payload?: ProjectPayload }) {
  const current = getProject(id);
  if (!current) return null;
  const title = values.title === undefined ? current.title : values.title.trim();
  if (!title || title.length > 120) throw new Error("Project title must contain 1–120 characters.");
  const payload = values.payload === undefined ? current.payload : values.payload;
  database().prepare("UPDATE projects SET title=?,payload=?,updated_at=? WHERE id=?")
    .run(title, JSON.stringify(payload), new Date().toISOString(), id);
  return getProject(id);
}

export function deleteProject(id: string) {
  return Number(database().prepare("DELETE FROM projects WHERE id=?").run(id).changes) > 0;
}

export function validatePayload(payload: unknown): payload is ProjectPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const record = payload as ProjectPayload;
  if (record.projectStatus !== undefined && !["Draft", "In Progress", "Awaiting Approval", "Completed", "Archived"].includes(String(record.projectStatus))) return false;
  if (record.priority !== undefined && (!Number.isInteger(record.priority) || Number(record.priority) < 1 || Number(record.priority) > 5)) return false;
  for (const key of ["characterIds", "locationIds"]) {
    if (record[key] !== undefined && (!Array.isArray(record[key]) || record[key].length > 100 || record[key].some((id) => typeof id !== "string" || id.length > 100))) return false;
  }
  for (const key of ["season", "episode"]) {
    if (record[key] !== undefined && (!Number.isInteger(record[key]) || Number(record[key]) < 1 || Number(record[key]) > 1000)) return false;
  }
  if (record.storyContinuity !== undefined && (typeof record.storyContinuity !== "string" || record.storyContinuity.length > 20_000)) return false;
  if (record.appearanceOverrides !== undefined && (!record.appearanceOverrides || typeof record.appearanceOverrides !== "object" || Array.isArray(record.appearanceOverrides))) return false;
  if (record.scenes !== undefined && (!Array.isArray(record.scenes) || record.scenes.length > 100 || record.scenes.some((scene) => !scene || typeof scene !== "object" || Array.isArray(scene)))) return false;
  const settings = record.settings;
  if (settings && typeof settings === "object") {
    const values = settings as Record<string, unknown>;
    if (values.referenceImages !== undefined) {
      if (!Array.isArray(values.referenceImages) || values.referenceImages.length > 12) return false;
      for (const item of values.referenceImages) {
        if (!item || typeof item !== "object") return false;
        const image = item as Record<string, unknown>;
        if (typeof image.dataUrl !== "string" || !/^data:image\/(png|jpeg|webp|gif);base64,/i.test(image.dataUrl)) return false;
        if (image.dataUrl.length > 2_800_000) return false;
      }
    }
    if (values.referenceVideos !== undefined) {
      if (!Array.isArray(values.referenceVideos) || values.referenceVideos.length > 20) return false;
      if (values.referenceVideos.some((url) => typeof url !== "string" || !/^https:\/\//i.test(url))) return false;
    }
  }
  return true;
}
