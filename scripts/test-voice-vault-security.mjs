import assert from "node:assert/strict";
import { createCipheriv, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const folder = mkdtempSync(join(tmpdir(), "ccai-vault-security-"));
process.env.CCAI_DATABASE_PATH = join(folder, "ccai.sqlite");
process.env.CCAI_VOICE_VAULT_ENCRYPTION_KEY = Buffer.alloc(32, 17).toString("base64");
process.env.CCAI_BOOTSTRAP_TOKEN = "synthetic-bootstrap-token";
const database = new DatabaseSync(process.env.CCAI_DATABASE_PATH);
const legacyKey = "sk_syntheticLegacyKey12345";
const iv = randomBytes(12);
const cipher = createCipheriv("aes-256-gcm", Buffer.alloc(32, 17), iv);
const encrypted = Buffer.concat([cipher.update(legacyKey, "utf8"), cipher.final()]);
const now = new Date().toISOString();
database.exec(`CREATE TABLE voice_api_accounts(id TEXT PRIMARY KEY,label TEXT NOT NULL,last_four TEXT NOT NULL,iv TEXT NOT NULL,ciphertext TEXT NOT NULL,auth_tag TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE voice_api_settings(setting TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE voice_usage_events(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,account_id TEXT NOT NULL,kind TEXT NOT NULL,characters INTEGER NOT NULL,estimated_credits INTEGER NOT NULL,estimated_cost_myr REAL NOT NULL,actual_cost_myr REAL,created_at TEXT NOT NULL);`);
database.prepare("INSERT INTO voice_api_accounts(id,label,last_four,iv,ciphertext,auth_tag,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").run("legacy-account", "Legacy account", legacyKey.slice(-4), iv.toString("base64"), encrypted.toString("base64"), cipher.getAuthTag().toString("base64"), now, now);
database.prepare("INSERT INTO voice_api_settings(setting,value) VALUES('selected_account','legacy-account')").run();
database.prepare("INSERT INTO voice_usage_events(id,project_id,account_id,kind,characters,estimated_credits,estimated_cost_myr,actual_cost_myr,created_at) VALUES(?,?,?,?,?,?,?,?,?)").run("legacy-usage", "legacy-project", "legacy-account", "initial", 37, 37, 0.01, null, now);
database.close();

try {
  const auth = await import("../src/lib/auth-store.ts");
  const vault = await import("../src/lib/voice-vault.ts");
  const owner = auth.bootstrapOwner("synthetic-bootstrap-token", "first.owner@example.test", "synthetic password 12");
  const accounts = vault.listVoiceAccounts(owner.id);
  assert.equal(accounts.length, 1, "bootstrap owner can see the preserved legacy vault account");
  assert.equal(accounts[0].id, "legacy-account");
  assert.equal(accounts[0].estimatedCreditsUsed, 37);
  assert.equal(accounts[0].generatedCharacters, 37);
  assert.equal(accounts[0].estimatedCostMyr, 0.01);
  assert.equal(JSON.stringify(accounts).includes(legacyKey), false, "account listing must never return API keys");
  assert.deepEqual(vault.getSelectedVoiceAccountSecret(owner.id), { accountId: "legacy-account", apiKey: legacyKey }, "legacy encrypted key remains decryptable only for its claimed owner");
  assert.deepEqual(vault.listVoiceAccounts("different-owner"), [], "another owner cannot list claimed legacy accounts");
  assert.equal(vault.getSelectedVoiceAccountSecret("different-owner"), null, "another owner cannot retrieve the selected legacy credential");
  assert.throws(() => vault.selectVoiceAccount("different-owner", "legacy-account"), /no longer exists/);

  const second = vault.saveVoiceAccount("different-owner", { label: "Synthetic second account", apiKey: "sk_syntheticSecondKey67890" });
  assert.equal(vault.listVoiceAccounts(owner.id).length, 1, "one owner's account changes do not affect the bootstrap owner");
  assert.equal(vault.listVoiceAccounts("different-owner").length, 1);
  assert.equal(vault.getSelectedVoiceAccountSecret("different-owner"), null, "new credentials are not selected until the owner selects them");
  vault.selectVoiceAccount("different-owner", second.id);
  assert.equal(vault.getSelectedVoiceAccountSecret("different-owner")?.accountId, second.id);

  const checkDb = new DatabaseSync(process.env.CCAI_DATABASE_PATH);
  const legacyTables = checkDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'voice_api_settings_legacy_unowned%'").all();
  assert.ok(legacyTables.length >= 1, "legacy settings table is retained as a migration backup");
  assert.equal(Number(checkDb.prepare("SELECT count(*) AS count FROM voice_usage_events WHERE id='legacy-usage'").get().count), 1, "legacy usage events are preserved");
  checkDb.close();
  console.log("PASS transactional owner-scope migration preserves legacy ciphertext/settings/usage and isolates account reads/writes");
} finally {
  rmSync(folder, { recursive: true, force: true });
}

const accountRoute = readFileSync(new URL("../src/app/api/ai/voice/accounts/route.ts", import.meta.url), "utf8");
const voiceRoute = readFileSync(new URL("../src/app/api/ai/voice/generate/route.ts", import.meta.url), "utf8");
const aiMutationRoutes = [
  "../src/app/api/ai/brief/route.ts",
  "../src/app/api/ai/scripts/generate/route.ts",
  "../src/app/api/ai/images/generate/route.ts",
  "../src/app/api/ai/voice/generate/route.ts",
  "../src/app/api/ai/voice/accounts/route.ts",
];
const renderFiles = [
  "../src/app/api/render/route.ts",
  "../src/app/api/render/[id]/route.ts",
  "../src/app/api/render/[id]/stream/route.ts",
  "../src/app/api/render/[id]/download/route.ts",
  "../src/app/api/render/[id]/post-production/route.ts",
];
assert.match(accountRoute, /listVoiceAccounts\(user\.id\)/);
assert.match(voiceRoute, /hasProjectApproval\(user\.id,[^\n]*"script"\)/);
assert.match(voiceRoute, /hasProjectApproval\(user\.id,[^\n]*"image"/);
assert.match(voiceRoute, /new SimulatedVoiceProvider\(\)/);
for (const relative of aiMutationRoutes) {
  const source = readFileSync(new URL(relative, import.meta.url), "utf8");
  assert.match(source, /getSessionUser\(request\)/, `${relative} requires a session`);
  if (/export async function POST/.test(source)) assert.match(source, /isSameOriginMutation\(request\)/, `${relative} mutations require exact same-origin`);
}
for (const relative of renderFiles) {
  const source = readFileSync(new URL(relative, import.meta.url), "utf8");
  assert.match(source, /requireRenderUser\(request\)/, `${relative} requires a session`);
  assert.match(source, /ownedRenderJob\(/, `${relative} checks render job ownership`);
}
assert.match(readFileSync(new URL("../src/app/api/render/route.ts", import.meta.url), "utf8"), /sameOriginMutation\(request\)/);
assert.match(readFileSync(new URL("../src/app/api/render/[id]/route.ts", import.meta.url), "utf8"), /sameOriginMutation\(request\)/);
assert.match(readFileSync(new URL("../src/app/api/render/[id]/post-production/route.ts", import.meta.url), "utf8"), /sameOriginMutation\(request\)/);
console.log("PASS every AI and render endpoint enforces session access; mutations use same-origin checks and render routes use owner checks");
