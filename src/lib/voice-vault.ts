import "server-only";
import { DatabaseSync } from "node:sqlite";
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getOwnedProject } from "./project-store";

export type VoiceAccountSummary = { id: string; label: string; lastFour: string; selected: boolean; createdAt: string; updatedAt: string; creditBalance: null; balanceStatus: "not_checked"; estimatedCreditsUsed: number; generatedCharacters: number; regeneratedCharacters: number; estimatedCostMyr: number; actualCostMyr: number | null };
const dbGlobal = globalThis as typeof globalThis & { ccaiVoiceVaultDb?: DatabaseSync };
function database() {
  if (dbGlobal.ccaiVoiceVaultDb) return dbGlobal.ccaiVoiceVaultDb;
  const filename = process.env.CCAI_DATABASE_PATH || resolve(process.cwd(), "data", "ccai.sqlite");
  if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;");
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS voice_api_accounts (
      id TEXT PRIMARY KEY, label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 80), last_four TEXT NOT NULL,
      iv TEXT NOT NULL, ciphertext TEXT NOT NULL, auth_tag TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      owner_id TEXT
    );
    CREATE TABLE IF NOT EXISTS voice_usage_events (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, account_id TEXT NOT NULL, kind TEXT NOT NULL,
      characters INTEGER NOT NULL, estimated_credits INTEGER NOT NULL, estimated_cost_myr REAL NOT NULL,
      actual_cost_myr REAL, created_at TEXT NOT NULL, owner_id TEXT
    );`);
    ensureColumn(db, "voice_api_accounts", "owner_id", "TEXT");
    ensureColumn(db, "voice_usage_events", "owner_id", "TEXT");
    const settingsExists = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='voice_api_settings'").get());
    if (!settingsExists) {
      db.exec("CREATE TABLE voice_api_settings(owner_id TEXT,setting TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(owner_id,setting))");
    } else {
      const columns = db.prepare("PRAGMA table_info(voice_api_settings)").all() as Array<{ name: string; pk: number }>;
      const ownerColumn = columns.find(column => column.name === "owner_id");
      const settingColumn = columns.find(column => column.name === "setting");
      if (!ownerColumn || ownerColumn.pk !== 1 || !settingColumn || settingColumn.pk !== 2) {
        let legacyName = "voice_api_settings_legacy_unowned", suffix = 1;
        while (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(legacyName)) legacyName = `voice_api_settings_legacy_unowned_${suffix++}`;
        db.exec(`ALTER TABLE voice_api_settings RENAME TO ${legacyName}`);
        db.exec("CREATE TABLE voice_api_settings(owner_id TEXT,setting TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(owner_id,setting))");
        const legacyColumns = db.prepare(`PRAGMA table_info(${legacyName})`).all() as Array<{ name: string }>;
        const hasOwner = legacyColumns.some(column => column.name === "owner_id");
        db.exec(hasOwner
          ? `INSERT INTO voice_api_settings(owner_id,setting,value) SELECT owner_id,setting,value FROM ${legacyName}`
          : `INSERT INTO voice_api_settings(owner_id,setting,value) SELECT NULL,setting,value FROM ${legacyName}`);
      }
    }
    db.exec("CREATE INDEX IF NOT EXISTS voice_usage_by_owner_account ON voice_usage_events(owner_id,account_id)");
    db.exec("COMMIT");
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* The transaction may not have started. */ }
    db.close();
    throw new Error("Voice key vault is unavailable because its owner-scope migration failed.");
  }
  dbGlobal.ccaiVoiceVaultDb = db;
  return db;
}

function ensureColumn(db: DatabaseSync, table: string, columnName: string, columnType: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some(column => column.name === columnName)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnName} ${columnType}`);
}
function encryptionKey() {
  const encoded = process.env.CCAI_VOICE_VAULT_ENCRYPTION_KEY || "";
  let key: Buffer;
  try { key = Buffer.from(encoded, "base64"); } catch { throw new Error("Voice key vault is unavailable; configure a 32-byte base64 encryption key on the server."); }
  if (key.length !== 32) throw new Error("Voice key vault is unavailable; configure a 32-byte base64 encryption key on the server.");
  return key;
}
function encrypt(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), ciphertext: ciphertext.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
}
function decrypt(row: { iv: string; ciphertext: string; auth_tag: string }) {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(row.iv, "base64"));
  decipher.setAuthTag(Buffer.from(row.auth_tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(row.ciphertext, "base64")), decipher.final()]).toString("utf8");
}
export function listVoiceAccounts(ownerId: string): VoiceAccountSummary[] {
  requireOwner(ownerId);
  const active = database().prepare("SELECT value FROM voice_api_settings WHERE owner_id=? AND setting='selected_account'").get(ownerId) as { value?: string } | undefined;
  return (database().prepare("SELECT id,label,last_four,created_at,updated_at FROM voice_api_accounts WHERE owner_id=? ORDER BY created_at").all(ownerId) as Array<Record<string, string>>).map((row) => {
    const usage = database().prepare("SELECT COALESCE(SUM(estimated_credits),0) AS credits,COALESCE(SUM(CASE WHEN kind='initial' THEN characters ELSE 0 END),0) AS generated,COALESCE(SUM(CASE WHEN kind!='initial' THEN characters ELSE 0 END),0) AS regenerated,COALESCE(SUM(estimated_cost_myr),0) AS estimated,CASE WHEN COUNT(actual_cost_myr)=0 THEN NULL ELSE SUM(actual_cost_myr) END AS actual FROM voice_usage_events WHERE owner_id=? AND account_id=?").get(ownerId,row.id) as Record<string, number | null>;
    return {
    id: row.id, label: row.label, lastFour: row.last_four, selected: row.id === active?.value,
    createdAt: row.created_at, updatedAt: row.updated_at, creditBalance: null, balanceStatus: "not_checked",
    estimatedCreditsUsed: Number(usage.credits || 0), generatedCharacters: Number(usage.generated || 0), regeneratedCharacters: Number(usage.regenerated || 0), estimatedCostMyr: Number(usage.estimated || 0), actualCostMyr: usage.actual === null ? null : Number(usage.actual),
  };
  });
}
export function recordVoiceUsage(event: { ownerId: string; projectId: string; accountId: string; kind: "initial" | "regeneration" | "retry"; characters: number; estimatedCredits: number; estimatedCostMyr: number; actualCostMyr: number | null }) {
  requireOwner(event.ownerId);
  if (!event.projectId || !event.accountId || !Number.isSafeInteger(event.characters) || event.characters < 0 || !Number.isSafeInteger(event.estimatedCredits) || event.estimatedCredits < 0 || !Number.isFinite(event.estimatedCostMyr) || event.estimatedCostMyr < 0 || (event.actualCostMyr !== null && (!Number.isFinite(event.actualCostMyr) || event.actualCostMyr < 0))) throw new Error("Invalid voice usage record.");
  if (!getOwnedProject(event.ownerId, event.projectId)) throw new Error("Project not found.");
  if (!database().prepare("SELECT 1 FROM voice_api_accounts WHERE owner_id=? AND id=?").get(event.ownerId,event.accountId)) throw new Error("Voice account not found.");
  database().prepare("INSERT INTO voice_usage_events(id,owner_id,project_id,account_id,kind,characters,estimated_credits,estimated_cost_myr,actual_cost_myr,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run(randomUUID(), event.ownerId, event.projectId, event.accountId, event.kind, event.characters, event.estimatedCredits, event.estimatedCostMyr, event.actualCostMyr, new Date().toISOString());
}
export function saveVoiceAccount(ownerId: string, input: { id?: string; label: string; apiKey: string }) {
  requireOwner(ownerId);
  const label = input.label.trim();
  if (!label || label.length > 80 || !/^sk_[A-Za-z0-9_-]{12,500}$/.test(input.apiKey)) throw new Error("Enter a short account label and a valid ElevenLabs API key.");
  const db = database();
  const id = input.id || randomUUID();
  const now = new Date().toISOString();
  const encrypted = encrypt(input.apiKey);
  const existing = db.prepare("SELECT id FROM voice_api_accounts WHERE owner_id=? AND id=?").get(ownerId,id);
  if (input.id && !existing) throw new Error("That voice account no longer exists.");
  if (existing) {
    db.prepare("UPDATE voice_api_accounts SET label=?,last_four=?,iv=?,ciphertext=?,auth_tag=?,updated_at=? WHERE owner_id=? AND id=?")
      .run(label, input.apiKey.slice(-4), encrypted.iv, encrypted.ciphertext, encrypted.authTag, now, ownerId,id);
  } else {
    db.prepare("INSERT INTO voice_api_accounts(owner_id,id,label,last_four,iv,ciphertext,auth_tag,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .run(ownerId,id, label, input.apiKey.slice(-4), encrypted.iv, encrypted.ciphertext, encrypted.authTag, now, now);
  }
  return listVoiceAccounts(ownerId).find((account) => account.id === id)!;
}
export function selectVoiceAccount(ownerId: string, id: string) {
  requireOwner(ownerId);
  if (!database().prepare("SELECT id FROM voice_api_accounts WHERE owner_id=? AND id=?").get(ownerId,id)) throw new Error("That voice account no longer exists.");
  database().prepare("INSERT INTO voice_api_settings(owner_id,setting,value) VALUES(?,'selected_account',?) ON CONFLICT(owner_id,setting) DO UPDATE SET value=excluded.value").run(ownerId,id);
  return listVoiceAccounts(ownerId);
}
export function removeVoiceAccount(ownerId: string, id: string) {
  requireOwner(ownerId);
  const db = database();
  db.prepare("DELETE FROM voice_api_accounts WHERE owner_id=? AND id=?").run(ownerId,id);
  db.prepare("DELETE FROM voice_api_settings WHERE owner_id=? AND setting='selected_account' AND value=?").run(ownerId,id);
  return listVoiceAccounts(ownerId);
}
export function getSelectedVoiceAccountSecret(ownerId: string) {
  requireOwner(ownerId);
  const active = database().prepare("SELECT value FROM voice_api_settings WHERE owner_id=? AND setting='selected_account'").get(ownerId) as { value?: string } | undefined;
  if (!active?.value) return null;
  const row = database().prepare("SELECT iv,ciphertext,auth_tag FROM voice_api_accounts WHERE owner_id=? AND id=?").get(ownerId,active.value) as { iv: string; ciphertext: string; auth_tag: string } | undefined;
  return row ? { accountId: active.value, apiKey: decrypt(row) } : null;
}

function requireOwner(ownerId: string) {
  if (typeof ownerId !== "string" || !ownerId.trim() || ownerId.length > 200) throw new Error("An authenticated account is required to access voice credentials.");
}
