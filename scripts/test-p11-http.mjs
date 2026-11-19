import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { createRequire, registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const root = mkdtempSync(join(tmpdir(), "ccai-prod-qa-"));
process.env.CCAI_DATABASE_PATH = join(root, "qa.sqlite");
process.env.CCAI_BOOTSTRAP_TOKEN = "qa-only-bootstrap-token";
process.env.CCAI_SCRIPT_PROVIDER = "simulated";
process.env.CCAI_IMAGE_PROVIDER = "simulated";
process.env.CCAI_VOICE_PROVIDER = "simulated";
process.env.CCAI_ENABLE_LIVE_AI = "false";
process.env.CCAI_LIVE_AI_APPROVED = "false";
process.env.CCAI_ENABLE_LIVE_IMAGES = "false";
process.env.CCAI_LIVE_IMAGES_APPROVED = "false";
process.env.CCAI_ENABLE_LIVE_VOICE = "false";
process.env.CCAI_LIVE_VOICE_APPROVED = "false";
process.env.CCAI_FFMPEG_PATH = "/bin/false";
process.env.CCAI_FFPROBE_PATH = "/bin/false";
process.env.CCAI_VOICE_VAULT_ENCRYPTION_KEY = Buffer.alloc(32, 17).toString("base64");
delete process.env.GEMINI_API_KEY;
delete process.env.FLUX_API_KEY;
delete process.env.ELEVENLABS_API_KEY;

const require = createRequire(import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve(require.resolve("next/server.js"), context);
    if (specifier === "server-only") return nextResolve(require.resolve("next/dist/compiled/server-only/empty.js"), context);
    if (specifier.startsWith("@/")) return nextResolve(resolve(process.cwd(), "src", `${specifier.slice(2)}.ts`), context);
    if (context.parentURL?.includes("/src/") && (specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      const candidate = resolve(dirname(fileURLToPath(context.parentURL)), `${specifier}.ts`);
      if (existsSync(candidate)) return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const routes = {};
for (const [key, path] of Object.entries({
  bootstrap: "../src/app/api/auth/bootstrap/route.ts",
  login: "../src/app/api/auth/login/route.ts",
  session: "../src/app/api/auth/session/route.ts",
  logout: "../src/app/api/auth/logout/route.ts",
  projects: "../src/app/api/projects/route.ts",
  project: "../src/app/api/projects/[id]/route.ts",
  approvals: "../src/app/api/projects/[id]/approvals/route.ts",
  entities: "../src/app/api/entities/[collection]/route.ts",
  script: "../src/app/api/ai/scripts/generate/route.ts",
  images: "../src/app/api/ai/images/generate/route.ts",
  voice: "../src/app/api/ai/voice/generate/route.ts",
  voiceAccounts: "../src/app/api/ai/voice/accounts/route.ts",
  render: "../src/app/api/render/route.ts",
  renderJob: "../src/app/api/render/[id]/route.ts",
  renderStream: "../src/app/api/render/[id]/stream/route.ts",
  renderDownload: "../src/app/api/render/[id]/download/route.ts",
})) routes[key] = await import(path);

const store = await import("../src/lib/project-store.ts");
const authStore = await import("../src/lib/auth-store.ts");
const approvalStore = await import("../src/lib/approval-store.ts");
const entityStore = await import("../src/lib/entity-store.ts");
const renderer = await import("../src/lib/ffmpeg-renderer.ts");
const origin = "https://qa.local.test";
const failures = [];
let checks = 0;

function check(label, condition, detail = "") {
  checks++;
  const line = `${condition ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`;
  console.log(line);
  if (!condition) failures.push(line);
}

function req(path, { method = "GET", body, cookie, originHeader = true, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined) h["content-type"] = "application/json";
  if (cookie) h.cookie = cookie;
  if (originHeader) h.origin = origin;
  return new Request(`${origin}${path}`, { method, headers: h, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

async function invoke(handler, path, options = {}, context) {
  const response = context ? await handler(req(path, options), context) : await handler(req(path, options));
  let body = null;
  try { body = await response.json(); } catch {}
  const cookieHeader = response.headers.getSetCookie?.()[0] || response.headers.get("set-cookie") || "";
  return { response, status: response.status, body, cookieHeader };
}

function cookieFrom(result) {
  const pair = result.cookieHeader.split(";")[0];
  return pair.startsWith("ccai_session=") ? pair : "";
}

async function stage(session, projectId, stage, resourceId) {
  return invoke(routes.approvals.POST, `/api/projects/${projectId}/approvals`, {
    method: "POST", cookie: session, body: { stage, ...(resourceId ? { resourceId } : {}) },
  }, { params: Promise.resolve({ id: projectId }) });
}

async function patchProject(session, projectId, payload) {
  return invoke(routes.project.PATCH, `/api/projects/${projectId}`, {
    method: "PATCH", cookie: session, body: { payload },
  }, { params: Promise.resolve({ id: projectId }) });
}

function expectStatus(label, result, expected) {
  check(label, result.status === expected, `expected ${expected}, received ${result.status}${result.body?.error ? ` (${result.body.error})` : ""}`);
}

function createSecondaryOwner() {
  const id = `qa-owner-${randomBytes(8).toString("hex")}`;
  const email = `${id}@example.test`;
  const password = "secondary-owner-password-123";
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  const encoded = `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
  globalThis.ccaiAuthDb.prepare("INSERT INTO auth_users(id,email,password_hash,created_at) VALUES(?,?,?,?)").run(id, email, encoded, new Date().toISOString());
  return { id, email, password };
}

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/wpgAAAAASUVORK5CYII=";
const emptyWav = "data:audio/wav;base64,UklGRgAAAABXQVZFZm10IBAAAAABAAEARKwAAESsAAABAAgAZGF0YQAAAAA=";

try {
  const initialSession = await invoke(routes.session.GET, "/api/auth/session");
  check("anonymous session reports setup availability", initialSession.status === 200 && initialSession.body.authenticated === false && initialSession.body.bootstrapAvailable === true);
  expectStatus("anonymous project list denied", await invoke(routes.projects.GET, "/api/projects"), 401);
  expectStatus("anonymous project create denied", await invoke(routes.projects.POST, "/api/projects", { method: "POST", body: { title: "attacker" } }), 401);
  expectStatus("bootstrap without same-origin header denied", await invoke(routes.bootstrap.POST, "/api/auth/bootstrap", { method: "POST", originHeader: false, body: { email: "owner@example.test", password: "primary-owner-password-123", bootstrapToken: process.env.CCAI_BOOTSTRAP_TOKEN } }), 403);
  expectStatus("incorrect bootstrap token denied", await invoke(routes.bootstrap.POST, "/api/auth/bootstrap", { method: "POST", body: { email: "owner@example.test", password: "primary-owner-password-123", bootstrapToken: "wrong-token" } }), 401);

  let boot = await invoke(routes.bootstrap.POST, "/api/auth/bootstrap", { method: "POST", body: { email: "owner@example.test", password: "primary-owner-password-123", bootstrapToken: process.env.CCAI_BOOTSTRAP_TOKEN } });
  check("first owner can bootstrap on a pristine database", boot.status === 201, `expected 201, received ${boot.status}${boot.body?.error ? ` (${boot.body.error})` : ""}`);
  if (boot.status !== 201) {
    // Keep exercising owner-scoped routes on a second isolated DB with the legacy
    // project/library schema initialized; the pristine-DB failure stays recorded.
    for (const key of ["ccaiDb", "ccaiAuthDb", "ccaiApprovalDb", "ccaiEntityDb", "ccaiVoiceVaultDb"]) {
      try { globalThis[key]?.close(); } catch {}
      try { delete globalThis[key]; } catch {}
    }
    process.env.CCAI_DATABASE_PATH = join(root, "schema-ready.sqlite");
    store.listProjects();
    entityStore.listEntities("characters");
    authStore.countUsers();
    boot = await invoke(routes.bootstrap.POST, "/api/auth/bootstrap", { method: "POST", body: { email: "owner@example.test", password: "primary-owner-password-123", bootstrapToken: process.env.CCAI_BOOTSTRAP_TOKEN } });
  }
  const owner1 = cookieFrom(boot);
  check("bootstrap cookie is HttpOnly and SameSite Strict", /HttpOnly/i.test(boot.cookieHeader) && /SameSite=Strict/i.test(boot.cookieHeader));
  check("bootstrap cookie is Secure under HTTPS", /Secure/i.test(boot.cookieHeader));
  expectStatus("second bootstrap is disabled", await invoke(routes.bootstrap.POST, "/api/auth/bootstrap", { method: "POST", body: { email: "other@example.test", password: "another-owner-password-123", bootstrapToken: process.env.CCAI_BOOTSTRAP_TOKEN } }), 409);

  const sessionResult = await invoke(routes.session.GET, "/api/auth/session", { cookie: owner1 });
  check("session endpoint recognizes the owner cookie", sessionResult.status === 200 && sessionResult.body.authenticated === true && sessionResult.body.user.email === "owner@example.test");
  expectStatus("bad password is rejected", await invoke(routes.login.POST, "/api/auth/login", { method: "POST", body: { email: "owner@example.test", password: "wrong-password" } }), 401);
  const login = await invoke(routes.login.POST, "/api/auth/login", { method: "POST", body: { email: "owner@example.test", password: "primary-owner-password-123" } });
  expectStatus("valid password creates a session", login, 200);
  const owner1Login = cookieFrom(login);
  check("login returns a session cookie", !!owner1Login && /HttpOnly/i.test(login.cookieHeader));

  const owner2Info = createSecondaryOwner();
  const owner2Login = await invoke(routes.login.POST, "/api/auth/login", { method: "POST", body: { email: owner2Info.email, password: owner2Info.password } });
  expectStatus("second synthetic owner can sign in", owner2Login, 200);
  const owner2 = cookieFrom(owner2Login);

  const voiceApiKey = "sk_syntheticTestCredential123456";
  expectStatus("anonymous voice account list denied", await invoke(routes.voiceAccounts.GET, "/api/ai/voice/accounts"), 401);
  const voiceSaved = await invoke(routes.voiceAccounts.POST, "/api/ai/voice/accounts", { method: "POST", cookie: owner1Login, body: { operation: "save", label: "QA only account", apiKey: voiceApiKey } });
  expectStatus("owner can save encrypted voice account", voiceSaved, 200);
  const voiceAccountId = voiceSaved.body?.account?.id;
  check("voice account response exposes only masked key metadata", !!voiceAccountId && voiceSaved.body.account.lastFour === voiceApiKey.slice(-4) && !JSON.stringify(voiceSaved.body).includes(voiceApiKey));
  const voiceListOwner1 = await invoke(routes.voiceAccounts.GET, "/api/ai/voice/accounts", { cookie: owner1Login });
  check("owner can list own voice account", voiceListOwner1.status === 200 && voiceListOwner1.body.accounts.some(account => account.id === voiceAccountId));
  const voiceSelectOwner1 = await invoke(routes.voiceAccounts.POST, "/api/ai/voice/accounts", { method: "POST", cookie: owner1Login, body: { operation: "select", id: voiceAccountId } });
  check("owner can select own voice account", voiceSelectOwner1.status === 200 && voiceSelectOwner1.body.accounts.some(account => account.id === voiceAccountId && account.selected));
  const voiceListOwner2 = await invoke(routes.voiceAccounts.GET, "/api/ai/voice/accounts", { cookie: owner2 });
  check("other owner cannot list the first owner's voice account", voiceListOwner2.status === 200 && voiceListOwner2.body.accounts.length === 0 && !JSON.stringify(voiceListOwner2.body).includes(voiceAccountId));
  const crossOwnerVoiceUpdate = await invoke(routes.voiceAccounts.POST, "/api/ai/voice/accounts", { method: "POST", cookie: owner2, body: { operation: "save", id: voiceAccountId, label: "stolen", apiKey: "sk_syntheticReplacementKey123456" } });
  check("other owner cannot update first owner's account and error masks key", crossOwnerVoiceUpdate.status === 400 && !JSON.stringify(crossOwnerVoiceUpdate.body).includes(voiceApiKey) && !JSON.stringify(crossOwnerVoiceUpdate.body).includes("sk_syntheticReplacementKey123456"));
  const crossOwnerVoiceRemove = await invoke(routes.voiceAccounts.POST, "/api/ai/voice/accounts", { method: "POST", cookie: owner2, body: { operation: "remove", id: voiceAccountId } });
  check("other owner cannot remove first owner's voice account", crossOwnerVoiceRemove.status === 200 && voiceVaultSummaryHasOwnerAccount((await invoke(routes.voiceAccounts.GET, "/api/ai/voice/accounts", { cookie: owner1Login })).body, voiceAccountId));
  const voiceRemoved = await invoke(routes.voiceAccounts.POST, "/api/ai/voice/accounts", { method: "POST", cookie: owner1Login, body: { operation: "remove", id: voiceAccountId } });
  check("owner can remove own voice account", voiceRemoved.status === 200 && !voiceVaultSummaryHasOwnerAccount(voiceRemoved.body, voiceAccountId) && !JSON.stringify(voiceRemoved.body).includes(voiceApiKey));

  const unsafeCreate = await invoke(routes.projects.POST, "/api/projects", { method: "POST", cookie: owner1Login, originHeader: false, body: { title: "must reject cross-site write", payload: {} } });
  expectStatus("project mutation without Origin denied", unsafeCreate, 403);
  const create = await invoke(routes.projects.POST, "/api/projects", { method: "POST", cookie: owner1Login, body: { title: "PROD-QA-01 synthetic project", payload: {} } });
  expectStatus("authenticated owner creates synthetic project", create, 201);
  const projectId = create.body?.project?.id;
  check("project row is assigned to owner 1", !!projectId && create.body.project.ownerId === owner1InfoId(boot));
  const owner1List = await invoke(routes.projects.GET, "/api/projects", { cookie: owner1Login });
  const owner2List = await invoke(routes.projects.GET, "/api/projects", { cookie: owner2 });
  check("project list is scoped to owner", owner1List.body.projects.some(p => p.id === projectId) && !owner2List.body.projects.some(p => p.id === projectId));
  expectStatus("other owner cannot read project", await invoke(routes.project.GET, `/api/projects/${projectId}`, { cookie: owner2 }, { params: Promise.resolve({ id: projectId }) }), 404);
  expectStatus("other owner cannot update project", await invoke(routes.project.PATCH, `/api/projects/${projectId}`, { cookie: owner2, method: "PATCH", body: { title: "cross-owner" } }, { params: Promise.resolve({ id: projectId }) }), 404);
  expectStatus("other owner cannot approve project", await stage(owner2, projectId, "brief"), 404);

  const payload = {
    idea: "Saved bakery story", reference: "A neighborhood bakery", referenceText: "Opened in 1980",
    brief: { title: "The Saved Bakery", direction: "Follow one morning", goal: "Show community", approved: true },
    script: "", scriptSavedText: "", scriptFormat: "narration", scriptApproved: false, scriptVersions: [],
    settings: { durationMinutes: 1, aspectRatio: "16:9", language: "English", visualStyle: "Documentary", referenceImages: [], referenceVideos: [] },
    imageSpendingLimitMyr: 0, voiceSpendingLimitMyr: 0, voiceFormat: "narration",
    voiceSettings: { speed: 1, stability: 0.55, similarity: 0.75, emotion: "Neutral", styleExaggeration: 0.2, pronunciation: "" },
    scenes: [],
  };
  const initialSave = await patchProject(owner1Login, projectId, payload);
  expectStatus("owner saves synthetic creative inputs", initialSave, 200);
  expectStatus("unapproved brief blocks script route", await invoke(routes.script.POST, "/api/ai/scripts/generate", { method: "POST", cookie: owner1Login, body: { projectId } }), 409);
  expectStatus("cross-origin script mutation rejected", await invoke(routes.script.POST, "/api/ai/scripts/generate", { method: "POST", cookie: owner1Login, originHeader: false, body: { projectId } }), 403);

  const briefApproval = await stage(owner1Login, projectId, "brief");
  expectStatus("approved saved brief can be recorded", briefApproval, 201);
  const briefApprovalAvailable = approvalStore.hasProjectApproval(owner1InfoId(boot), projectId, "brief");

  const scriptResult = await invoke(routes.script.POST, "/api/ai/scripts/generate", { method: "POST", cookie: owner1Login, body: { projectId, idea: "FORGED CLIENT IDEA", brief: { approved: true, title: "Forged" } } });
  expectStatus("script is simulated from saved inputs", scriptResult, 200);
  check("client-supplied creative values are ignored", !!scriptResult.body?.draft?.text && scriptResult.body.draft.text.includes("Saved bakery story") && !scriptResult.body.draft.text.includes("FORGED CLIENT IDEA"));

  const afterScript = { ...payload, script: scriptResult.body?.draft?.text || "", scriptSavedText: scriptResult.body?.draft?.text || "", scriptApproved: false, scriptVersions: [{ id: "qa-v1", text: scriptResult.body?.draft?.text || "", reason: "generated", createdAt: new Date().toISOString() }] };
  const saveScript = await patchProject(owner1Login, projectId, afterScript);
  expectStatus("simulated script is persisted to synthetic project", saveScript, 200);
  check("harmless downstream save preserves brief approval", approvalStore.hasProjectApproval(owner1InfoId(boot), projectId, "brief"), briefApprovalAvailable ? "brief approval remains current after script save" : "brief approval was already stale");
  const scriptApproval = await stage(owner1Login, projectId, "script");
  expectStatus("current saved script can be approved after generation", scriptApproval, 201);

  const sceneId = "qa-scene-1";
  const voiceId = "qa-voice-1";
  const scene = { id: sceneId, title: "Bakery opens", line: "The baker starts before sunrise.", seconds: 1, prompt: "Saved prompt: bakery before sunrise.", approved: false, approvalStatus: "pending", image: false, imageData: "", imageVersions: [], imagePromptUsed: "", scriptTextUsed: "", voiceSegments: [{ id: voiceId, text: "The baker starts before sunrise.", role: "narration", profileId: "qa-neutral", status: "pending", approved: false, needsGeneration: true, durationSeconds: 0, dataUrl: "", versions: [], settings: payload.voiceSettings }] };
  const withScene = { ...afterScript, scriptApproved: true, scenes: [scene] };
  expectStatus("scene breakdown saves against current script", await patchProject(owner1Login, projectId, withScene), 200);
  const imageGeneration = await invoke(routes.images.POST, "/api/ai/images/generate", { method: "POST", cookie: owner1Login, body: { projectId, sceneIds: [sceneId], prompt: "FORGED PROMPT", scriptApproved: true } });
  expectStatus("selected pending image is generated by simulated provider", imageGeneration, 200);
  const simulatedSvg = imageGeneration.body?.results?.[0]?.imageDataUrl?.includes(",") ? Buffer.from(imageGeneration.body.results[0].imageDataUrl.split(",")[1], "base64").toString("utf8") : "";
  check("image output is tied to saved scene prompt", imageGeneration.body?.provider === "simulated" && imageGeneration.body?.results?.[0]?.id === sceneId && simulatedSvg.includes(scene.prompt) && !simulatedSvg.includes("FORGED PROMPT"));
  expectStatus("unknown scene ID is rejected", await invoke(routes.images.POST, "/api/ai/images/generate", { method: "POST", cookie: owner1Login, body: { projectId, sceneIds: ["attacker-scene"] } }), 400);

  const approvedScene = {
    ...scene, approved: true, approvalStatus: "approved", image: true, imageData: png,
    imageVersions: [{ image: png, prompt: scene.prompt, scriptText: scene.line, aspectRatio: "16:9", createdAt: new Date().toISOString(), provider: "qa-fixture" }],
    imagePromptUsed: scene.prompt, scriptTextUsed: scene.line, needsGeneration: false, generationStatus: "completed",
  };
  const saveApprovedImage = await patchProject(owner1Login, projectId, { ...withScene, scenes: [approvedScene] });
  expectStatus("approved UI image and imageData fixture saves", saveApprovedImage, 200);
  const imageApproval = await stage(owner1Login, projectId, "image", sceneId);
  expectStatus("saved UI image receives server approval", imageApproval, 201);
  if (imageApproval.status === 201) {
    expectStatus("approved image cannot be regenerated", await invoke(routes.images.POST, "/api/ai/images/generate", { method: "POST", cookie: owner1Login, body: { projectId, sceneIds: [sceneId] } }), 409);
  }

  if (imageApproval.status === 201) {
    const voiceGeneration = await invoke(routes.voice.POST, "/api/ai/voice/generate", { method: "POST", cookie: owner1Login, body: { projectId, provider: "elevenlabs", scenes: [{ id: voiceId, sceneId }] } });
    expectStatus("saved pending voice line generates with simulated provider", voiceGeneration, 200);
    check("client provider selection cannot enable paid voice", voiceGeneration.body?.provider === "simulated" && voiceGeneration.body?.results?.length === 1 && voiceGeneration.body.results[0].audioDataUrl?.startsWith("data:audio/wav;base64,"));
    if (voiceGeneration.status === 200) {
      const generatedVoice = voiceGeneration.body.results[0];
      const approvedVoiceLine = { ...scene.voiceSegments[0], status: "completed", approved: true, needsGeneration: false, durationSeconds: generatedVoice.durationSeconds, dataUrl: generatedVoice.audioDataUrl, versions: [{ id: "qa-audio-v1", dataUrl: generatedVoice.audioDataUrl, durationSeconds: generatedVoice.durationSeconds, provider: "simulated" }] };
      const withVoice = { ...withScene, scenes: [{ ...approvedScene, voiceSegments: [approvedVoiceLine] }] };
      expectStatus("generated voice result can be saved", await patchProject(owner1Login, projectId, withVoice), 200);
      const voiceApproval = await stage(owner1Login, projectId, "voice", voiceId);
      expectStatus("approved saved voice receives server approval", voiceApproval, 201);

      if (voiceApproval.status === 201) {
        const duration = 2;
        const speechDuration = Math.min(1.5, Number(generatedVoice.durationSeconds) || 0.5);
        const manifest = { version: 1, timeUnit: "seconds", duration, tracks: [
          { id: "images", kind: "image", clips: [{ id: "image-qa-scene-1", sourceRef: `image:${sceneId}`, start: 0, duration, sourceOffset: 0, timing: "estimated", motion: "none", transitionIn: "cut" }] },
          { id: "narration", kind: "narration", clips: [{ id: "voice-qa-line-1", sourceRef: `voice:${voiceId}`, start: 0, duration: speechDuration, sourceOffset: 0, timing: "estimated", motion: "none", transitionIn: "cut" }] },
          { id: "dialogue", kind: "dialogue", clips: [] },
          { id: "captions", kind: "caption", clips: [] },
        ] };
        const hash = renderer.hashRenderManifest(manifest);
        const timeline = { version: 1, timeUnit: "seconds", tracks: manifest.tracks, estimatedDuration: duration, actualAudioDuration: speechDuration, renderApproval: { approved: true, approvedAt: new Date().toISOString(), manifestHash: hash } };
        const thumbId = "qa-thumbnail-1";
        const complete = { ...withVoice, timeline, thumbnailVariants: [{ id: thumbId, status: "approved", assetRef: png, text: "The Saved Bakery", orientation: "landscape" }], exportPackage: { thumbnailId: thumbId, metadata: { title: "The Saved Bakery" }, createdAt: new Date().toISOString() } };
        expectStatus("current approved media and timeline are saved", await patchProject(owner1Login, projectId, complete), 200);
        expectStatus("approved timeline stage is recorded", await stage(owner1Login, projectId, "timeline"), 201);
        expectStatus("thumbnail approval requires prior gates and selected asset", await stage(owner1Login, projectId, "thumbnail", thumbId), 201);
        expectStatus("export approval requires approved thumbnail", await stage(owner1Login, projectId, "export"), 201);
        const goodRender = await invoke(routes.render.POST, "/api/render", { method: "POST", cookie: owner1Login, body: { projectId, manifest } });
        expectStatus("authenticated render with current approval is accepted", goodRender, 202);
        const renderId = goodRender.body?.job?.id;
        if (renderId) {
          expectStatus("owner can inspect own render job", await invoke(routes.renderJob.GET, `/api/render/${renderId}`, { cookie: owner1Login }, { params: Promise.resolve({ id: renderId }) }), 200);
          expectStatus("other owner cannot inspect render job", await invoke(routes.renderJob.GET, `/api/render/${renderId}`, { cookie: owner2 }, { params: Promise.resolve({ id: renderId }) }), 404);
          const anonymousStream = await invoke(routes.renderStream.HEAD, `/api/render/${renderId}/stream`, {}, { params: Promise.resolve({ id: renderId }) });
          check("anonymous stream cannot inspect render output", anonymousStream.status === 401, `received ${anonymousStream.status}`);
          const anonymousDownload = await invoke(routes.renderDownload.GET, `/api/render/${renderId}/download`, {}, { params: Promise.resolve({ id: renderId }) });
          check("anonymous download cannot inspect render output", anonymousDownload.status === 401, `received ${anonymousDownload.status}`);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        const harmlessPayload = { ...complete, notes: "unrelated project note" };
        expectStatus("unrelated note save succeeds", await patchProject(owner1Login, projectId, harmlessPayload), 200);
        check("harmless note save preserves current timeline approval", approvalStore.hasProjectApproval(owner1InfoId(boot), projectId, "timeline"));
        const stalePayload = { ...harmlessPayload, timeline: { ...timeline, estimatedDuration: 1.9 } };
        expectStatus("editing approved timeline invalidates its server approval", await patchProject(owner1Login, projectId, stalePayload), 200);
        const staleRender = await invoke(routes.render.POST, "/api/render", { method: "POST", cookie: owner1Login, body: { projectId, manifest } });
        expectStatus("stale or edited timeline render is rejected", staleRender, 409);
        const changedBrief = { ...harmlessPayload, brief: { ...harmlessPayload.brief, title: "Changed approved brief" } };
        expectStatus("brief content change saves", await patchProject(owner1Login, projectId, changedBrief), 200);
        check("changed brief invalidates brief approval", !approvalStore.hasProjectApproval(owner1InfoId(boot), projectId, "brief"));
        check("changed brief cascades to script approval", !approvalStore.hasProjectApproval(owner1InfoId(boot), projectId, "script"));
        check("changed brief cascades to image approval", !approvalStore.hasProjectApproval(owner1InfoId(boot), projectId, "image", sceneId));
        check("changed brief cascades to voice approval", !approvalStore.hasProjectApproval(owner1InfoId(boot), projectId, "voice", voiceId));
        check("changed brief cascades to timeline approval", !approvalStore.hasProjectApproval(owner1InfoId(boot), projectId, "timeline"));
        check("changed brief cascades to thumbnail and export approvals", !approvalStore.hasProjectApproval(owner1InfoId(boot), projectId, "thumbnail", thumbId) && !approvalStore.hasProjectApproval(owner1InfoId(boot), projectId, "export"));
      } else {
        check("timeline/render/thumbnail/export approval chain", false, "BLOCKED: voice approval failed");
      }
    } else {
      check("voice/timeline/render/thumbnail/export approval chain", false, "BLOCKED: simulated voice generation failed");
    }
  } else {
    check("image/voice/timeline/render/thumbnail/export approval chain", false, "BLOCKED: server image approval failed");
  }

  const crossOwnerScript = await invoke(routes.script.POST, "/api/ai/scripts/generate", { method: "POST", cookie: owner2, body: { projectId } });
  expectStatus("other owner cannot invoke project script generation", crossOwnerScript, 404);
  const crossOwnerImage = await invoke(routes.images.POST, "/api/ai/images/generate", { method: "POST", cookie: owner2, body: { projectId, sceneIds: [sceneId] } });
  expectStatus("other owner cannot invoke project image generation", crossOwnerImage, 404);

  const unauthRender = await invoke(routes.render.POST, "/api/render", { method: "POST", body: { projectId, manifest: {} } });
  expectStatus("anonymous render submission denied", unauthRender, 401);
  const unauthorizedStream = await invoke(routes.renderStream.HEAD, "/api/render/unknown/stream", {}, { params: Promise.resolve({ id: "unknown" }) });
  check("anonymous render stream is denied", [401, 403].includes(unauthorizedStream.status), `received ${unauthorizedStream.status}`);
  const unauthorizedDownload = await invoke(routes.renderDownload.GET, "/api/render/unknown/download", {}, { params: Promise.resolve({ id: "unknown" }) });
  check("anonymous render download is denied", [401, 403].includes(unauthorizedDownload.status), `received ${unauthorizedDownload.status}`);

  const logout = await invoke(routes.logout.POST, "/api/auth/logout", { method: "POST", cookie: owner1Login });
  expectStatus("logout revokes session", logout, 200);
  const afterLogout = await invoke(routes.session.GET, "/api/auth/session", { cookie: owner1Login });
  check("revoked cookie no longer authenticates", afterLogout.status === 200 && afterLogout.body.authenticated === false);
} catch (error) {
  console.error("HARNESS ERROR", error);
  failures.push(`HARNESS ERROR — ${error instanceof Error ? error.stack : String(error)}`);
} finally {
  for (const key of ["ccaiDb", "ccaiAuthDb", "ccaiApprovalDb", "ccaiEntityDb", "ccaiVoiceVaultDb"]) {
    const value = globalThis[key];
    try { value?.close(); } catch {}
    try { delete globalThis[key]; } catch {}
  }
  rmSync(root, { recursive: true, force: true });
}

console.log(`\n${checks} in-process API checks; ${failures.length} failure(s). No network sockets or live provider calls were used.`);
if (failures.length) process.exitCode = 1;

function owner1InfoId(bootstrapResult) {
  return bootstrapResult.body?.user?.id || "";
}

function voiceVaultSummaryHasOwnerAccount(body, accountId) {
  return Array.isArray(body?.accounts) && body.accounts.some(account => account.id === accountId);
}
