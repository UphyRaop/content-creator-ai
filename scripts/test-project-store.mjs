import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";

// Node's strip-types mode does not resolve TypeScript's extensionless imports.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.includes("/src/") && (specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    const candidate = resolve(dirname(fileURLToPath(context.parentURL)), `${specifier}.ts`);
    if (existsSync(candidate)) return nextResolve(`${specifier}.ts`, context);
  }
  return nextResolve(specifier, context);
} });

const directory = mkdtempSync(join(tmpdir(), "ccai-sqlite-test-"));
process.env.CCAI_DATABASE_PATH = join(directory, "projects.sqlite");
try {
  const workflow = await import("../src/lib/script-workflow.ts");
  const store = await import("../src/lib/project-store.ts");
  const entities = await import("../src/lib/entity-store.ts");
  const imageFlow = await import("../src/lib/image-workflow.ts");
  const voiceFlow = await import("../src/lib/voice-workflow.ts");
  const timelineFlow = await import("../src/lib/timeline-workflow.ts");
  const prototype = readFileSync(new URL("../prototype.html", import.meta.url), "utf8");
  assert.match(prototype, /class="project-search-top"/);
  assert.match(prototype, />All Status<\/option>/);
  assert.match(prototype, />All Series<\/option>/);
  assert.match(prototype, /projectFilters\.status==='all'/);
  assert.match(prototype, /projectFilters\.series==='all'/);
  console.log("PASS places dashboard search above filters and preserves default labels and filter logic");
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

  const character = entities.saveEntity("characters", { id: "character-1", name: "Mira", age: "28", appearance: "Short dark hair", referenceImages: [] });
  assert.equal(character.name, "Mira");
  assert.equal(entities.listEntities("characters")[0].appearance, "Short dark hair");
  assert.throws(() => entities.saveEntity("characters", { id: "bad", name: "", referenceImages: [] }), /Invalid/);
  assert.throws(() => entities.listEntities("other"), /Unknown collection/);
  const duplicate = entities.duplicateEntity("characters", "character-1");
  assert.equal(duplicate?.name, "Copy of Mira");
  assert.equal(entities.deleteEntity("characters", duplicate.id), true);
  console.log("PASS stores, validates, duplicates, and deletes reusable SQLite library records");
  const voiceProfile = entities.saveEntity("voices", { id: "voice-1", name: "Narrator", type: "narrator", voiceId: "demo-neutral", language: "Malay", speed: 1, stability: 0.6, similarity: 0.8, styleExaggeration: 0.2 });
  assert.equal(entities.listEntities("voices")[0].id, voiceProfile.id);
  assert.throws(() => entities.saveEntity("voices", { id: "voice-bad", name: "Bad", type: "character", speed: 3 }), /Invalid/);
  console.log("PASS stores reusable narrator and character voice profile metadata with bounded settings");

  assert.equal(store.validatePayload({ projectStatus: "Awaiting Approval", priority: 1, seriesId: "series-a", season: 2, episode: 3, characterIds: ["character-1"], locationIds: ["place-1"], storyContinuity: "Previous event" }), true);
  assert.equal(store.validatePayload({ projectStatus: "Publishing" }), false);
  assert.equal(store.validatePayload({ priority: 6 }), false);
  assert.equal(store.validatePayload({ season: 0 }), false);
  assert.equal(store.validatePayload({ scenes: "invalid" }), false);
  console.log("PASS validates project status, queue, episodic continuity, assignments, and scene metadata");

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

  const scenePlan = imageFlow.planSceneBreakdown({ script: "First the train arrives. Then Mira finds the letter. Finally, the family reads it together.", durationSeconds: 60, visualStyle: "Documentary", aspectRatio: "16:9", characters: ["Mira"], locations: ["Station"] });
  assert.equal(scenePlan.length, 15);
  assert.ok(scenePlan.every((scene) => scene.seconds >= 3 && scene.seconds <= 5));
  assert.ok(scenePlan.every((scene) => scene.approvalStatus === "pending" && scene.imageVersions.length === 0));
  const orderedScript = scenePlan.map((scene) => scene.line).join(" ");
  assert.ok(orderedScript.indexOf("train") < orderedScript.indexOf("letter"));
  assert.ok(orderedScript.indexOf("letter") < orderedScript.indexOf("together"));
  assert.equal(imageFlow.planSceneBreakdown({ script: "Story", durationSeconds: 300, visualStyle: "Cinematic", aspectRatio: "9:16" }).length, 75);
  assert.throws(() => imageFlow.planSceneBreakdown({ script: "", durationSeconds: 60, visualStyle: "", aspectRatio: "16:9" }), /non-empty script/);
  assert.ok(imageFlow.planSceneBreakdown({ script: "春天来到城市，孩子找到一封信。", durationSeconds: 60, visualStyle: "Cinematic", aspectRatio: "16:9", language: "Chinese" }).some((scene) => scene.line.includes("春天")));
  console.log("PASS plans chronological scenes at approximately four seconds each, including Chinese text");

  const reviewScenes = [
    { ...scenePlan[0], id: "approved", image: "old-approved", approved: true, approvalStatus: "approved", decision: null },
    { ...scenePlan[1], id: "rejected", image: "old-rejected", decision: "reject" },
    { ...scenePlan[2], id: "accepted", image: "accepted-image", decision: "approve" },
  ];
  const decision = imageFlow.confirmSceneDecisions(reviewScenes);
  assert.deepEqual(decision.rejectedIds, ["rejected"]);
  assert.equal(decision.scenes[0], reviewScenes[0], "approved scenes are preserved by identity");
  assert.equal(decision.scenes[0].image, "old-approved");
  assert.equal(decision.scenes[1].approvalStatus, "rejected");
  assert.equal(decision.scenes[2].approved, true);
  assert.equal(imageFlow.canGenerateVoice(decision.scenes), false);
  assert.equal(imageFlow.canGenerateVoice(decision.scenes.map((scene) => ({ ...scene, image: scene.image || "new-image", approved: true }))), true);
  console.log("PASS confirms per-scene decisions without changing approved images and keeps voice locked");

  const queued = [{ id: "j1", sceneId: "s1", status: "generating", progress: 45, kind: "initial", prompt: "p", scriptText: "s", createdAt: "now" }, { id: "j2", sceneId: "s2", status: "pending", progress: 0, kind: "initial", prompt: "p", scriptText: "s", createdAt: "now" }];
  assert.equal(imageFlow.recoverImageJobs(queued)[0].status, "pending");
  assert.equal(imageFlow.recoverImageJobs(queued)[0].progress, 0);
  assert.deepEqual(imageFlow.deduplicateImageJobs(queued, [{ ...queued[0], id: "j3", sceneId: "s1" }, { ...queued[0], id: "j4", sceneId: "s3" }]).map((job) => job.id), ["j4"]);
  console.log("PASS recovers interrupted queue work and prevents duplicate scene jobs");

  assert.equal(imageFlow.imageRequestKind(false), "initial");
  assert.equal(imageFlow.imageRequestKind(true), "regeneration");
  assert.equal(imageFlow.estimateImageCostMyr(4, "simulated"), 0);
  assert.equal(imageFlow.estimateImageCostMyr(4, "flux-schnell"), null);
  assert.equal(imageFlow.estimateImageCostMyr(4, "flux-schnell", 0.5), 2);
  assert.throws(() => imageFlow.estimateImageCostMyr(101, "simulated"), /between 0 and 100/);
  const crop = imageFlow.coverCrop(1000, 2000, 1920, 1080, 1, 0.5);
  assert.ok(Math.abs(crop.sw / crop.sh - 16 / 9) < 0.001);
  assert.ok(crop.sy > 0, "portrait source should be cropped vertically for a landscape frame");
  console.log("PASS keeps live pricing unknown without configuration and computes distortion-free crop geometry");

  const validImageRequest = { scriptApproved: true, aspectRatio: "9:16", spendingLimitMyr: 0, scenes: [{ id: "s1", prompt: "Image prompt", scriptText: "Script beat", approvalStatus: "pending" }] };
  assert.equal(imageFlow.validateImageGenerationRequest(validImageRequest), true);
  assert.equal(imageFlow.validateImageGenerationRequest({ ...validImageRequest, scriptApproved: false }), false);
  assert.equal(imageFlow.validateImageGenerationRequest({ ...validImageRequest, scenes: [{ ...validImageRequest.scenes[0], approvalStatus: "approved" }] }), false);
  assert.equal(imageFlow.validateImageGenerationRequest({ ...validImageRequest, scenes: [{ ...validImageRequest.scenes[0], id: "" }] }), false);
  console.log("PASS rejects unapproved scripts, approved-scene regeneration, and malformed image requests");

  const audioLine = (id, overrides = {}) => ({ id, text: "A short spoken line.", role: "narration", profileId: "voice-1", status: "completed", approved: true, decision: null, needsGeneration: false, durationSeconds: 2, estimatedDurationSeconds: 2, versions: [{ id: "audio-v1", dataUrl: "data:audio/wav;base64,YQ==", durationSeconds: 2, provider: "simulated" }], ...overrides });
  const voiceScenes = [{ id: "voice-scene-1", line: "A short spoken line.", seconds: 2, image: "approved-image", approved: true, voiceSegments: [audioLine("voice-line-1"), audioLine("voice-line-2")] }];
  assert.equal(voiceFlow.canGenerateVoice(voiceScenes), true);
  assert.equal(voiceFlow.voiceIsComplete(voiceScenes), true);
  assert.equal(voiceFlow.voiceIsComplete([{ ...voiceScenes[0], voiceSegments: [audioLine("voice-line-1"), audioLine("voice-line-2", { approved: false })] }]), false);
  assert.equal(voiceFlow.canGenerateVoice([{ ...voiceScenes[0], approved: false }]), false);
  assert.ok(voiceFlow.estimateSpeechSeconds("One short line", 1) > voiceFlow.estimateSpeechSeconds("One short line", 1.5));
  const synced = voiceFlow.synchronizeAudioDurations([{ ...voiceScenes[0], voiceSegments: [audioLine("voice-line-1", { durationSeconds: 2.2 }), audioLine("voice-line-2", { durationSeconds: 1.8 })] }]);
  assert.equal(synced[0].seconds, 4);
  assert.equal(voiceFlow.estimateVoiceCredits(150, "simulated"), 0);
  assert.equal(voiceFlow.estimateVoiceCredits(150, "elevenlabs"), null);
  assert.equal(voiceFlow.estimateVoiceCredits(150, "elevenlabs", 1), 150);
  assert.equal(voiceFlow.estimateVoiceCostMyr(null, 1), null);
  assert.equal(voiceFlow.estimateVoiceCostMyr(150, 2), .3);
  const voiceDecision = voiceFlow.confirmVoiceDecisions([
    { id: "already-approved", approved: true, decision: "reject" },
    { id: "voice-reject", approved: false, decision: "reject" },
    { id: "voice-approve", approved: false, decision: "approve" },
  ]);
  assert.deepEqual(voiceDecision.rejectedIds, ["voice-reject"]);
  assert.equal(voiceDecision.scenes[0].approved, true);
  assert.equal(voiceDecision.scenes[2].approved, true);
  const voiceJobs = [{ id: "vjob1", sceneId: "s1", segmentId: "a1", status: "pending", progress: 0, kind: "initial", createdAt: "now" }];
  assert.deepEqual(voiceFlow.deduplicateVoiceJobs(voiceJobs, [
    { ...voiceJobs[0], id: "duplicate" },
    { ...voiceJobs[0], id: "another-line", segmentId: "a2" },
  ]).map(job => job.id), ["vjob1", "another-line"]);
  assert.equal(voiceFlow.recoverVoiceJobs([{ ...voiceJobs[0], status: "generating", progress: 50 }])[0].status, "pending");
  const validVoiceRequest = { provider: "simulated", projectId: "project-1", scenesApproved: true, format: "mixed", aspectRatio: "9:16", spendingLimitMyr: 0, settings: { ...voiceFlow.defaultVoiceSettings }, scenes: [{ id: "line-1", sceneId: "scene-1", text: "Hello world", voiceId: "demo-neutral", kind: "initial", imageApproved: true }] };
  assert.equal(voiceFlow.validateVoiceGenerationRequest(validVoiceRequest), true);
  assert.equal(voiceFlow.validateVoiceGenerationRequest({ ...validVoiceRequest, scenesApproved: false }), false);
  assert.equal(voiceFlow.validateVoiceGenerationRequest({ ...validVoiceRequest, settings: { ...validVoiceRequest.settings, speed: 2.5 } }), false);
  const savedAudioPayload = { scriptApproved: true, voiceSettings: { speed: 1 }, scenes: [{ id: "s1", approved: true, image: true, voiceSegments: [audioLine("line-1")] }] };
  assert.equal(store.validatePayload(savedAudioPayload), true);
  assert.equal(store.validatePayload({ ...savedAudioPayload, scenes: [{ ...savedAudioPayload.scenes[0], voiceSegments: [{ ...savedAudioPayload.scenes[0].voiceSegments[0], versions: [{ dataUrl: "data:text/plain;base64,YQ==" }] }] }] }), false);
  console.log("PASS voice approval gates, scene-only decisions, audio duration sync, job recovery/deduplication, credit estimates, payload validation, and malformed request rejection");

  const readyScenes = [{ id: "scene-a", seconds: 2, line: "First line", image: "data:image/png;base64,aA==", approved: true, voiceSegments: [
    { id: "line-a", role: "narration", text: "First line", status: "completed", approved: true, durationSeconds: 2, dataUrl: "data:audio/wav;base64,YQ==" },
    { id: "line-b", role: "dialogue", text: "Second line", status: "completed", approved: true, durationSeconds: 1.5, dataUrl: "data:audio/wav;base64,YQ==" },
  ] }];
  assert.equal(timelineFlow.canCreateTimeline({ scriptApproved: false, scenes: readyScenes }), false);
  assert.equal(timelineFlow.canCreateTimeline({ scriptApproved: true, scenes: [{ ...readyScenes[0], approved: false }] }), false);
  assert.equal(timelineFlow.canCreateTimeline({ scriptApproved: true, scenes: [{ ...readyScenes[0], voiceSegments: [{ ...readyScenes[0].voiceSegments[0], approved: false }] }] }), false);
  const timeline = timelineFlow.buildTimelineFromProject({ scriptApproved: true, scenes: readyScenes });
  const consecutiveTimeline = timelineFlow.buildTimelineFromProject({ scriptApproved: true, scenes: Array.from({ length: 15 }, (_, index) => ({
    ...readyScenes[0], id: `scene-${index}`, seconds: 4.4,
    voiceSegments: [{ ...readyScenes[0].voiceSegments[0], id: `line-${index}`, durationSeconds: 4.4 }],
  })) });
  assert.equal(store.validatePayload({ timeline: consecutiveTimeline }), true, "floating-point noise between adjacent generated clips must not reject an otherwise valid timeline");
  const sceneTimed = timelineFlow.buildTimelineFromProject({ scriptApproved: true, scenes: [
    { ...readyScenes[0], seconds: 4, voiceSegments: [readyScenes[0].voiceSegments[0]] },
    { id: "scene-b", seconds: 3, line: "Next", image: "data:image/png;base64,Yg==", approved: true, voiceSegments: [{ ...readyScenes[0].voiceSegments[0], id: "line-b2", durationSeconds: 1 }] },
  ] });
  assert.equal(sceneTimed.tracks.find(track => track.kind === "image").clips[1].start, 4);
  assert.equal(sceneTimed.tracks.find(track => track.kind === "narration").clips[1].start, 4);
  const movedTrack = timelineFlow.moveClipToTrack(timeline, "track-narration", "track-dialogue", "voice-line-a", 0);
  assert.equal(movedTrack.tracks.find(track => track.id === "track-dialogue").clips[0].id, "voice-line-a");
  assert.equal(timeline.tracks.find(track => track.id === "track-narration").clips.length, 1, "cross-track operations must preserve the input timeline");
  assert.throws(() => timelineFlow.moveClipToTrack(timeline, "track-narration", "track-image", "voice-line-a", 0), /Only speech clips/);
  assert.equal(prototype.includes("core.moveClipToTrack(t,source.id,target.id,clip.id,start)"), true);
  assert.equal(prototype.includes("event.clientX-rect.left-labelWidth"), false);
  const silenceEdited = timelineFlow.applySilenceRanges(timeline, "track-narration", "voice-line-a", [{ start: .5, end: 1 }]);
  assert.equal(silenceEdited.tracks.find(track => track.kind === "caption").clips[0].duration, 1.5);
  assert.equal(silenceEdited.tracks.find(track => track.kind === "narration").clips.length, 2);
  assert.equal(silenceEdited.tracks.find(track => track.kind === "narration").clips[1].sourceOffset, 1);
  const consecutiveNarration = timelineFlow.buildTimelineFromProject({ scriptApproved: true, scenes: [{ ...readyScenes[0], voiceSegments: readyScenes[0].voiceSegments.map(line => ({ ...line, role: "narration" })) }] });
  const shortened = timelineFlow.applySilenceRanges(consecutiveNarration, "track-narration", "voice-line-a", [{ start: .5, end: 1 }]);
  assert.equal(shortened.tracks.find(track => track.kind === "narration").clips.find(clip => clip.id === "voice-line-b").start, 1.5, "later narration must close the removed gap");
  assert.equal(prototype.includes("core.applySilenceRanges(next,track.id,item.clipId,item.ranges)"), true);
  assert.equal(prototype.includes("fullPcm.slice(from,to)"), true);
  assert.equal(prototype.includes("id=\"timelineMoveTime\""), true);
  assert.equal(prototype.includes("function applyCaptionPreset(name)"), true);
  assert.equal(prototype.includes("||clips[0]"), false, "timeline gaps should not fall back to the first scene");
  assert.equal(prototype.includes("timelinePreviewGap"), true);
  assert.equal(prototype.includes("analyzeTimelineSilence('all')"), true);
  assert.equal(prototype.includes("Snap</label>"), true);
  assert.equal(timeline.timeUnit, "seconds");
  assert.equal(timeline.estimatedDuration, 3.5);
  assert.deepEqual(timeline.tracks.find(track => track.kind === "caption").clips.map(clip => clip.text), ["First line", "Second line"]);
  assert.throws(() => timelineFlow.moveClip(timeline, "track-dialogue", "voice-line-b", 0.5), /cannot overlap/);
  const edited = timelineFlow.trimClip(timeline, "track-image", "image-scene-a", 0.25, 2.5);
  assert.equal(edited.tracks.find(track => track.kind === "image").clips[0].sourceOffset, 0.25);
  assert.throws(() => timelineFlow.trimClip(timeline, "track-image", "image-scene-a", 0, 0), /duration/);
  const split = timelineFlow.splitClip(edited, "track-image", "image-scene-a", 1.25, "image-scene-a-split");
  assert.equal(split.tracks.find(track => track.kind === "image").clips.length, 2);
  const timelineDuplicate = timelineFlow.duplicateClip(split, "track-image", "image-scene-a", "image-copy", 3);
  assert.equal(timelineDuplicate.tracks.find(track => track.kind === "image").clips.length, 3);
  const automaticTransitions = timelineFlow.assignAutomaticTransitions(timelineDuplicate, "crossfade", .75);
  assert.equal(automaticTransitions.tracks.find(track => track.kind === "image").clips[0].transitionIn, "cut");
  assert.equal(automaticTransitions.tracks.find(track => track.kind === "image").clips[1].transitionIn, "crossfade");
  assert.equal(automaticTransitions.tracks.find(track => track.kind === "image").clips[1].transitionDuration, .75);
  const deleted = timelineFlow.deleteClip(timelineDuplicate, "track-image", "image-copy");
  assert.equal(deleted.tracks.find(track => track.kind === "image").clips.length, 2);
  const replaced = timelineFlow.replaceClipAsset(deleted, "track-image", "image-scene-a", "asset:replacement");
  assert.equal(replaced.tracks.find(track => track.kind === "image").clips[0].sourceRef, "asset:replacement");
  assert.throws(() => timelineFlow.replaceClipAsset(timeline, "track-image", "image-scene-a", " "), /required/);
  const instructed = timelineFlow.setClipInstructions(timeline, "track-image", "image-scene-a", { motion: "zoom-in", transitionIn: "crossfade", transitionDuration: 0.5, cameraStart: { x: .5, y: .5, scale: 1 }, cameraEnd: { x: .5, y: .5, scale: 1.2 } });
  assert.equal(instructed.tracks[0].clips[0].motion, "zoom-in");
  assert.throws(() => timelineFlow.setClipInstructions(timeline, "track-image", "image-scene-a", { transitionIn: "explode" }), /Invalid/);
  const automatic = timelineFlow.assignAutomaticCameraMotion(timeline);
  assert.ok(automatic.tracks.find(track => track.kind === "image").clips[0].cameraEnd.scale > 1);
  assert.equal(timelineFlow.estimateTimelineDuration(timeline), 3.5);
  assert.equal(timelineFlow.prepareRenderManifest(timeline).timeUnit, "seconds");
  const undoStack = timelineFlow.pushTimelineUndo([], timeline), redone = timelineFlow.redoTimeline([], timeline, undoStack);
  assert.equal(redone.timeline.estimatedDuration, timeline.estimatedDuration);
  const restored = timelineFlow.undoTimeline(undoStack, edited, []);
  assert.equal(restored.timeline.estimatedDuration, timeline.estimatedDuration);
  const silence = new Float32Array(8000 * 2); silence.fill(.4, 0, 4000); silence.fill(.4, 12000);
  assert.equal(timelineFlow.suggestSilenceRanges(silence, 8000, { sensitivity: .02, minSilenceSeconds: .5, paddingSeconds: 0 }).length, 1);
  assert.throws(() => timelineFlow.suggestSilenceRanges(silence, 8000, { sensitivity: 2, minSilenceSeconds: .5, paddingSeconds: 0 }), /out of range/);
  assert.equal(store.validatePayload({ timeline }), true);
  assert.equal(store.updateProject(project.id, { payload: { timeline } })?.payload.timeline.estimatedDuration, timeline.estimatedDuration);
  assert.equal(store.getProject(project.id)?.payload.timeline.estimatedDuration, timeline.estimatedDuration, "timeline survives SQLite reload");
  assert.equal(prototype.includes("decodeTimelineWaveform(url,clip.sourceOffset,clip.duration)"), true);
  assert.equal(store.validatePayload({ timeline: { ...timeline, timeUnit: "frames" } }), false);
  const overlaps = structuredClone(timeline); overlaps.tracks.find(track => track.kind === "dialogue").clips[0].start = 1;
  assert.equal(store.validatePayload({ timeline: overlaps }), false);
  console.log("PASS timeline approval gates, exact audio timing, caption mapping, non-destructive editing, overlap prevention, undo/redo, motion, captions, silence analysis, and bounded persistence");

  assert.equal(store.deleteProject(project.id), true);
  assert.equal(store.getProject(project.id), null);
  assert.equal(store.deleteProject(project.id), false);
  console.log("PASS deletes project records");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
