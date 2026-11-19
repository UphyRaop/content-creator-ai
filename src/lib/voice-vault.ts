import "server-only";
import { DatabaseSync } from "node:sqlite";
import { createCipheriv, createDecipheriv, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type VoiceAccountSummary = { id: string; label: string; lastFour: string; selected: boolean; createdAt: string; updatedAt: string; creditBalance: null; balanceStatus: "not_checked"; estimatedCreditsUsed: number; generatedCharacters: number; regeneratedCharacters: number; estimatedCostMyr: number; actualCostMyr: number | null };
const dbGlobal = globalThis as typeof globalThis & { ccaiVoiceVaultDb?: DatabaseSync };
function database() {
  if (dbGlobal.ccaiVoiceVaultDb) return dbGlobal.ccaiVoiceVaultDb;
  const filename = process.env.CCAI_DATABASE_PATH || resolve(process.cwd(), "data", "ccai.sqlite");
  if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;");
  db.exec(`CREATE TABLE IF NOT EXISTS voice_api_accounts (
    id TEXT PRIMARY KEY, label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 80), last_four TEXT NOT NULL,
    iv TEXT NOT NULL, ciphertext TEXT NOT NULL, auth_tag TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS voice_api_settings (setting TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS voice_usage_events (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, account_id TEXT NOT NULL, kind TEXT NOT NULL,
    characters INTEGER NOT NULL, estimated_credits INTEGER NOT NULL, estimated_cost_myr REAL NOT NULL,
    actual_cost_myr REAL, created_at TEXT NOT NULL
  );`);
  dbGlobal.ccaiVoiceVaultDb = db;
  return db;
}
function encryptionKey() {
  const encoded = process.env.CCAI_VOICE_VAULT_ENCRYPTION_KEY || "";
  let key: Buffer;
  try { key = Buffer.from(encoded, "base64"); } catch { throw new Error("Voice key vault is unavailable; configure a 32-byte base64 encryption key on the server."); }
  if (key.length !== 32) throw new Error("Voice key vault is unavailable; configure a 32-byte base64 encryption key on the server.");
  return key;
}
export function verifyVoiceVaultAdminToken(candidate: string | null): boolean {
  const expected = process.env.CCAI_VOICE_VAULT_ADMIN_TOKEN || "";
  if (!candidate || !expected) return false;
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
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
export function listVoiceAccounts(): VoiceAccountSummary[] {
  const active = database().prepare("SELECT value FROM voice_api_settings WHERE setting='selected_account'").get() as { value?: string } | undefined;
  return (database().prepare("SELECT id,label,last_four,created_at,updated_at FROM voice_api_accounts ORDER BY created_at").all() as Array<Record<string, string>>).map((row) => {
    const usage = database().prepare("SELECT COALESCE(SUM(estimated_credits),0) AS credits,COALESCE(SUM(CASE WHEN kind='initial' THEN characters ELSE 0 END),0) AS generated,COALESCE(SUM(CASE WHEN kind!='initial' THEN characters ELSE 0 END),0) AS regenerated,COALESCE(SUM(estimated_cost_myr),0) AS estimated,CASE WHEN COUNT(actual_cost_myr)=0 THEN NULL ELSE SUM(actual_cost_myr) END AS actual FROM voice_usage_events WHERE account_id=?").get(row.id) as Record<string, number | null>;
    return {
    id: row.id, label: row.label, lastFour: row.last_four, selected: row.id === active?.value,
    createdAt: row.created_at, updatedAt: row.updated_at, creditBalance: null, balanceStatus: "not_checked",
    estimatedCreditsUsed: Number(usage.credits || 0), generatedCharacters: Number(usage.generated || 0), regeneratedCharacters: Number(usage.regenerated || 0), estimatedCostMyr: Number(usage.estimated || 0), actualCostMyr: usage.actual === null ? null : Number(usage.actual),
  };
  });
}
export function recordVoiceUsage(event: { projectId: string; accountId: string; kind: "initial" | "regeneration" | "retry"; characters: number; estimatedCredits: number; estimatedCostMyr: number; actualCostMyr: number | null }) {
  if (!event.projectId || !event.accountId || !Number.isSafeInteger(event.characters) || event.characters < 0 || !Number.isSafeInteger(event.estimatedCredits) || event.estimatedCredits < 0 || !Number.isFinite(event.estimatedCostMyr) || event.estimatedCostMyr < 0 || (event.actualCostMyr !== null && (!Number.isFinite(event.actualCostMyr) || event.actualCostMyr < 0))) throw new Error("Invalid voice usage record.");
  database().prepare("INSERT INTO voice_usage_events(id,project_id,account_id,kind,characters,estimated_credits,estimated_cost_myr,actual_cost_myr,created_at) VALUES(?,?,?,?,?,?,?,?,?)").run(randomUUID(), event.projectId, event.accountId, event.kind, event.characters, event.estimatedCredits, event.estimatedCostMyr, event.actualCostMyr, new Date().toISOString());
}
export function saveVoiceAccount(input: { id?: string; label: string; apiKey: string }) {
  const label = input.label.trim();
  if (!label || label.length > 80 || !/^sk_[A-Za-z0-9_-]{12,500}$/.test(input.apiKey)) throw new Error("Enter a short account label and a valid ElevenLabs API key.");
  const db = database();
  const id = input.id || randomUUID();
  const now = new Date().toISOString();
  const encrypted = encrypt(input.apiKey);
  const existing = db.prepare("SELECT id FROM voice_api_accounts WHERE id=?").get(id);
  if (input.id && !existing) throw new Error("That voice account no longer exists.");
  if (existing) {
    db.prepare("UPDATE voice_api_accounts SET label=?,last_four=?,iv=?,ciphertext=?,auth_tag=?,updated_at=? WHERE id=?")
      .run(label, input.apiKey.slice(-4), encrypted.iv, encrypted.ciphertext, encrypted.authTag, now, id);
  } else {
    db.prepare("INSERT INTO voice_api_accounts(id,label,last_four,iv,ciphertext,auth_tag,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
      .run(id, label, input.apiKey.slice(-4), encrypted.iv, encrypted.ciphertext, encrypted.authTag, now, now);
  }
  return listVoiceAccounts().find((account) => account.id === id)!;
}
export function selectVoiceAccount(id: string) {
  if (!database().prepare("SELECT id FROM voice_api_accounts WHERE id=?").get(id)) throw new Error("That voice account no longer exists.");
  database().prepare("INSERT INTO voice_api_settings(setting,value) VALUES('selected_account',?) ON CONFLICT(setting) DO UPDATE SET value=excluded.value").run(id);
  return listVoiceAccounts();
}
export function removeVoiceAccount(id: string) {
  const db = database();
  db.prepare("DELETE FROM voice_api_accounts WHERE id=?").run(id);
  db.prepare("DELETE FROM voice_api_settings WHERE setting='selected_account' AND value=?").run(id);
  return listVoiceAccounts();
}
export function getSelectedVoiceAccountSecret() {
  const active = database().prepare("SELECT value FROM voice_api_settings WHERE setting='selected_account'").get() as { value?: string } | undefined;
  if (!active?.value) return null;
  const row = database().prepare("SELECT iv,ciphertext,auth_tag FROM voice_api_accounts WHERE id=?").get(active.value) as { iv: string; ciphertext: string; auth_tag: string } | undefined;
  return row ? { accountId: active.value, apiKey: decrypt(row) } : null;
}
