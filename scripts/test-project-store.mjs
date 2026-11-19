import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "ccai-sqlite-test-"));
process.env.CCAI_DATABASE_PATH = join(directory, "projects.sqlite");
try {
  const workflow = await import("../src/lib/script-workflow.ts");
  const store = await import("../src/lib/project-store.ts");
  const project = store.createProject("Demo film", { step: 2, settings: { durationMinutes: 3 } });
  assert.equal(project.title, "Demo film");
  assert.equal(project.payload.step, 2);
  assert.ok(store.listProjects().some((item) => item.id === project.id));
  console.log("PASS creates and lists projects");

  const updated = store.updateProject(project.id, { payload: { step: 4, settings: { aspectRatio: "9:16" } } });
  assert.equal(updated?.payload.step, 4);
  assert.equal(updated?.payload.settings.aspectRatio, "9:16");
  assert.ok(updated.updatedAt >= updated.createdAt);
  console.log("PASS updates persistent workflow state");

  assert.throws(() => store.createProject("  "), /1–120/);
  assert.throws(() => store.createProject("x".repeat(121)), /1–120/);
  console.log("PASS validates project names");

  const valid = { settings: { referenceImages: [{ name: "a.png", category: "character", dataUrl: "data:image/png;base64,aGVsbG8=" }], referenceVideos: ["https://example.test/ref"] } };
  assert.equal(store.validatePayload(valid), true);
  assert.equal(store.validatePayload({ settings: { referenceImages: [{ dataUrl: "data:text/plain;base64,YQ==" }] } }), false);
  assert.equal(store.validatePayload({ settings: { referenceVideos: ["javascript:alert(1)"] } }), false);
  console.log("PASS validates image and video references");

  const request = { idea: "A bakery story", durationMinutes: 2, language: "English", visualStyle: "Documentary", format: "mixed", brief: { title: "Bakery", direction: "A warm story", goal: "Inspire", approved: true }, referenceText: "A family recipe", referenceVideos: ["https://example.test/video"] };
  assert.equal(workflow.validateScriptRequest(request), true);
  assert.equal(workflow.validateScriptRequest({ ...request, brief: { ...request.brief, approved: false } }), false);
  assert.equal(workflow.validateScriptRequest({ ...request, referenceVideos: ["javascript:alert(1)"] }), false);
  assert.equal(workflow.validateScriptRequest({ ...request, durationMinutes: 6 }), false);
  console.log("PASS validates approval gate, duration, and HTTPS references for script requests");

  const draft = workflow.createSimulatedScript(request);
  assert.match(draft.text, /HOST|NARRATOR/);
  assert.equal(draft.wordCount, workflow.wordCount(draft.text));
  assert.ok(draft.estimatedSeconds > 0);
  assert.equal(workflow.estimateCostMyr(1000, 500, 1, 2), 0.002);
  assert.equal(workflow.estimateCostMyr(1000, 500), null);
  console.log("PASS generates simulated dialogue, duration estimates, and optional MYR usage estimate");

  const first = workflow.appendScriptVersion([], "first draft", "generated");
  const second = workflow.appendScriptVersion(first, "edited draft", "edited");
  assert.equal(second.length, 2);
  assert.equal(second[0].text, "first draft");
  assert.equal(workflow.appendScriptVersion(second, "edited draft", "edited").length, 2);
  console.log("PASS preserves and deduplicates script version history");

  assert.equal(store.deleteProject(project.id), true);
  assert.equal(store.getProject(project.id), null);
  assert.equal(store.deleteProject(project.id), false);
  console.log("PASS deletes project records");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
