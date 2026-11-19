import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "ccai-sqlite-test-"));
process.env.CCAI_DATABASE_PATH = join(directory, "projects.sqlite");
try {
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

  assert.equal(store.deleteProject(project.id), true);
  assert.equal(store.getProject(project.id), null);
  assert.equal(store.deleteProject(project.id), false);
  console.log("PASS deletes project records");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
