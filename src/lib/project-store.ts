import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { invalidateChangedProjectApprovals } from "./approval-store";

export type ProjectPayload = Record<string, unknown>;
export type ProjectRow = {
  id: string;
  ownerId?: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
  payload: ProjectPayload;
};

function validTimeline(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const t = value as Record<string, unknown>;
  if (t.version !== 1 || t.timeUnit !== "seconds" || !Array.isArray(t.tracks) || t.tracks.length < 1 || t.tracks.length > 16) return false;
  if (!Number.isFinite(t.estimatedDuration) || Number(t.estimatedDuration) < 0 || Number(t.estimatedDuration) > 3600) return false;
  if (t.actualAudioDuration !== null && (!Number.isFinite(t.actualAudioDuration) || Number(t.actualAudioDuration) < 0 || Number(t.actualAudioDuration) > 3600)) return false;
  const approval = t.renderApproval;
  if (!approval || typeof approval !== "object" || Array.isArray(approval) || typeof (approval as Record<string, unknown>).approved !== "boolean") return false;
  const a = approval as Record<string, unknown>;
  if ([a.approvedAt, a.manifestHash].some(x => x !== undefined && (typeof x !== "string" || x.length > 200))) return false;
  const ids = new Set<string>(); let clips = 0; const speech: Array<{start:number;end:number}> = [];
  for (const rawTrack of t.tracks) {
    if (!rawTrack || typeof rawTrack !== "object" || Array.isArray(rawTrack)) return false;
    const track = rawTrack as Record<string, unknown>;
    if (typeof track.id !== "string" || !track.id || track.id.length > 120 || ids.has(track.id) || !["image", "narration", "dialogue", "caption"].includes(String(track.kind)) || !Array.isArray(track.clips) || track.clips.length > 1000) return false;
    ids.add(track.id);
    for (const rawClip of track.clips) {
      clips++;
      if (clips > 1000 || !rawClip || typeof rawClip !== "object" || Array.isArray(rawClip)) return false;
      const c = rawClip as Record<string, unknown>;
      if (typeof c.id !== "string" || !c.id || c.id.length > 120 || ids.has(c.id) || typeof c.sourceRef !== "string" || !c.sourceRef || c.sourceRef.length > 500) return false;
      ids.add(c.id);
      if (![c.start, c.duration, c.sourceOffset].every(x => typeof x === "number" && Number.isFinite(x) && Math.abs(Number(x)*1000-Math.round(Number(x)*1000))<1e-7) || Number(c.start) < 0 || Number(c.duration) <= 0 || Number(c.sourceOffset) < 0 || Number(c.start)+Number(c.duration)>3600) return false;
      if (!["estimated", "word-level"].includes(String(c.timing)) || !["none", "zoom-in", "zoom-out", "pan-left", "pan-right", "pan-up", "pan-down"].includes(String(c.motion)) || !["cut", "crossfade", "fade-black", "wipe", "slide", "zoom"].includes(String(c.transitionIn))) return false;
      if (c.transitionDuration !== undefined && (!Number.isFinite(c.transitionDuration) || Number(c.transitionDuration) < 0 || Number(c.transitionDuration) > 5 || Math.abs(Number(c.transitionDuration)*1000-Math.round(Number(c.transitionDuration)*1000))>=1e-7)) return false;
      if (c.motionIntensity !== undefined && (!Number.isFinite(c.motionIntensity) || Number(c.motionIntensity) < 0 || Number(c.motionIntensity) > 1)) return false;
      if (c.motionDuration !== undefined && (!Number.isFinite(c.motionDuration) || Number(c.motionDuration) < 0.1 || Number(c.motionDuration) > 120 || Math.abs(Number(c.motionDuration)*1000-Math.round(Number(c.motionDuration)*1000))>=1e-7)) return false;
      const validPoint = (point: unknown) => {
        if (!point || typeof point !== "object" || Array.isArray(point)) return false;
        const p = point as Record<string, unknown>;
        return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.scale) && Number(p.x)>=0 && Number(p.x)<=1 && Number(p.y)>=0 && Number(p.y)<=1 && Number(p.scale)>=0.1 && Number(p.scale)<=10;
      };
      if ((c.cameraStart !== undefined && !validPoint(c.cameraStart)) || (c.cameraEnd !== undefined && !validPoint(c.cameraEnd))) return false;
      if (track.kind !== "image" && (c.motionIntensity !== undefined || c.motionDuration !== undefined || c.cameraStart !== undefined || c.cameraEnd !== undefined)) return false;
      if (c.text !== undefined && (typeof c.text !== "string" || c.text.length > 12000)) return false;
      if (track.kind === "narration" || track.kind === "dialogue") speech.push({start:Number(c.start),end:Number(c.start)+Number(c.duration)});
    }
  }
  speech.sort((x,y)=>x.start-y.start);
  // Timeline values are millisecond-rounded, but JS addition can make two
  // adjacent clips appear to overlap by a few floating-point ulps (e.g.
  // 8.8 + 4.4 becomes 13.200000000000001). Allow only that representation
  // noise; real overlaps remain rejected.
  for(let i=1;i<speech.length;i++) if(speech[i-1].end>speech[i].start+1e-9) return false;
  return true;
}

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
  const columns=db.prepare("PRAGMA table_info(projects)").all() as Array<{name:string}>;
  if(!columns.some(column=>column.name==="owner_id"))db.exec("ALTER TABLE projects ADD COLUMN owner_id TEXT");
  db.exec("CREATE INDEX IF NOT EXISTS projects_owner_id_idx ON projects(owner_id)");
  globalStore.ccaiDb = db;
  return db;
}

function parseRow(row: Record<string, unknown>): ProjectRow {
  return {
    id: String(row.id),
    ownerId: row.owner_id===null||row.owner_id===undefined?null:String(row.owner_id),
    title: String(row.title),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    payload: JSON.parse(String(row.payload)) as ProjectPayload,
  };
}

export function listProjects(ownerId?:string) {
  const sql="SELECT id,title,created_at,updated_at,CAST(COALESCE(json_extract(payload,'$.step'),0) AS INTEGER) AS step,COALESCE(json_extract(payload,'$.projectStatus'),'Draft') AS project_status,CAST(COALESCE(json_extract(payload,'$.priority'),3) AS INTEGER) AS priority,COALESCE(json_extract(payload,'$.seriesId'),'') AS series_id,COALESCE(json_extract(payload,'$.channelId'),'') AS channel_id,COALESCE(json_extract(payload,'$.brandKitId'),'') AS brand_kit_id FROM projects"+(ownerId===undefined?"":" WHERE owner_id=?")+" ORDER BY updated_at DESC";
  return (ownerId===undefined?database().prepare(sql).all():database().prepare(sql).all(ownerId))
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
export function getOwnedProject(ownerId:string,id:string):ProjectRow|null{
  const row=database().prepare("SELECT * FROM projects WHERE id=? AND owner_id=?").get(id,ownerId);
  return row?parseRow(row as Record<string,unknown>):null;
}

export function createProject(title: string, payload: ProjectPayload = {}, ownerId:string|null=null) {
  const cleanTitle = title.trim();
  if (!cleanTitle || cleanTitle.length > 120) throw new Error("Project title must contain 1–120 characters.");
  const now = new Date().toISOString();
  const id = randomUUID();
  database().prepare("INSERT INTO projects(id,title,created_at,updated_at,payload,owner_id) VALUES(?,?,?,?,?,?)")
    .run(id, cleanTitle, now, now, JSON.stringify(payload),ownerId);
  return getProject(id)!;
}

export function updateProject(id: string, values: { title?: string; payload?: ProjectPayload }) {
  const current = getProject(id);
  if (!current) return null;
  const title = values.title === undefined ? current.title : values.title.trim();
  if (!title || title.length > 120) throw new Error("Project title must contain 1–120 characters.");
  const payload = values.payload === undefined ? current.payload : values.payload;
  database().prepare("UPDATE projects SET title=?,payload=?,updated_at=? WHERE id=?")
    .run(title, JSON.stringify(payload), nextUpdatedAt(current.updatedAt), id);
  if(current.ownerId)invalidateChangedProjectApprovals(current.ownerId,id,current.payload,payload);
  return getProject(id);
}
export function updateOwnedProject(ownerId:string,id:string,values:{title?:string;payload?:ProjectPayload}){
  const current=getOwnedProject(ownerId,id);if(!current)return null;
  const title=values.title===undefined?current.title:values.title.trim();if(!title||title.length>120)throw new Error("Project title must contain 1–120 characters.");
  const payload=values.payload===undefined?current.payload:values.payload;
  const result=database().prepare("UPDATE projects SET title=?,payload=?,updated_at=? WHERE id=? AND owner_id=?").run(title,JSON.stringify(payload),nextUpdatedAt(current.updatedAt),id,ownerId);
  if(!Number(result.changes))return null;invalidateChangedProjectApprovals(ownerId,id,current.payload,payload);return getOwnedProject(ownerId,id);
}
function nextUpdatedAt(previous:string){const now=Date.now(),last=Date.parse(previous);return new Date(Math.max(now,Number.isFinite(last)?last+1:now)).toISOString();}

export function deleteProject(id: string) {
  return Number(database().prepare("DELETE FROM projects WHERE id=?").run(id).changes) > 0;
}
export function deleteOwnedProject(ownerId:string,id:string){return Number(database().prepare("DELETE FROM projects WHERE id=? AND owner_id=?").run(id,ownerId).changes)>0;}

export function validatePayload(payload: unknown): payload is ProjectPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const record = payload as ProjectPayload;
  // Older projects omit timeline; when present, accept only the bounded v1 schema.
  // New drafts serialize timeline:null until the voice stage creates one.
  // Accept that empty draft state, while validating every populated timeline.
  if (record.timeline !== undefined && record.timeline !== null && !validTimeline(record.timeline)) return false;
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
  if (record.scenes !== undefined) {
    if (!Array.isArray(record.scenes) || record.scenes.length > 100 || record.scenes.some((scene) => !scene || typeof scene !== "object" || Array.isArray(scene))) return false;
    let voiceLineCount = 0;
    for (const rawScene of record.scenes) {
      const scene = rawScene as Record<string, unknown>;
      if (scene.voiceSegments === undefined) continue;
      if (!Array.isArray(scene.voiceSegments) || scene.voiceSegments.length > 20) return false;
      voiceLineCount += scene.voiceSegments.length;
      if (voiceLineCount > 500) return false;
      for (const rawLine of scene.voiceSegments) {
        if (!rawLine || typeof rawLine !== "object" || Array.isArray(rawLine)) return false;
        const line = rawLine as Record<string, unknown>;
        if (typeof line.id !== "string" || line.id.length > 120 || typeof line.text !== "string" || line.text.length > 12_000 || !["narration", "dialogue"].includes(String(line.role)) || typeof line.profileId !== "string" || line.profileId.length > 120) return false;
        if (line.status !== undefined && !["pending", "generating", "completed", "failed", "cancelled"].includes(String(line.status))) return false;
        if (line.durationSeconds !== undefined && (!Number.isFinite(line.durationSeconds) || Number(line.durationSeconds) < 0 || Number(line.durationSeconds) > 120)) return false;
        if (line.versions !== undefined) {
          if (!Array.isArray(line.versions) || line.versions.length > 100) return false;
          for (const rawVersion of line.versions) {
            if (!rawVersion || typeof rawVersion !== "object") return false;
            const version = rawVersion as Record<string, unknown>;
            if (typeof version.dataUrl !== "string" || !/^data:audio\/(wav|mpeg|mp3|mp4|x-m4a|aac|ogg|webm|x-wav);base64,/i.test(version.dataUrl) || version.dataUrl.length > 14_000_000) return false;
          }
        }
      }
    }
  }
  if (record.voiceJobs !== undefined && (!Array.isArray(record.voiceJobs) || record.voiceJobs.length > 1000 || record.voiceJobs.some((job) => !job || typeof job !== "object" || !["pending", "generating", "completed", "failed", "cancelled"].includes(String((job as Record<string, unknown>).status))))) return false;
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
