import { NextResponse } from "next/server";
import { getSessionUser, isSameOriginMutation } from "@/lib/auth";
import { getOwnedProject } from "@/lib/project-store";
import { hasProjectApproval } from "@/lib/approval-store";
import { SimulatedVoiceProvider } from "@/lib/voice-provider";
import { defaultVoiceSettings, validateVoiceGenerationRequest } from "@/lib/voice-workflow";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: { "cache-control": "no-store" } });
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Cross-origin mutation rejected." }, { status: 403, headers: { "cache-control": "no-store" } });
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 16 * 1024) return NextResponse.json({ error: "Voice request is too large." }, { status: 413, headers: { "cache-control": "no-store" } });
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "A saved project ID and voice segment IDs are required." }, { status: 400, headers: { "cache-control": "no-store" } });
    const input = body as Record<string, unknown>;
    if (typeof input.projectId !== "string" || !input.projectId || !Array.isArray(input.scenes) || input.scenes.length < 1 || input.scenes.length > 100) return NextResponse.json({ error: "A saved project ID and one or more selected voice segments are required." }, { status: 400, headers: { "cache-control": "no-store" } });
    if (!input.scenes.every(item => item && typeof item === "object" && typeof (item as Record<string, unknown>).id === "string" && typeof (item as Record<string, unknown>).sceneId === "string")) return NextResponse.json({ error: "Voice segment identifiers are invalid." }, { status: 400, headers: { "cache-control": "no-store" } });

    const project = getOwnedProject(user.id, input.projectId);
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404, headers: { "cache-control": "no-store" } });
    if (!hasProjectApproval(user.id, project.id, "script")) return NextResponse.json({ error: "Approve the current script before generating voice." }, { status: 409, headers: { "cache-control": "no-store" } });
    const payload = project.payload;
    const savedScenes = Array.isArray(payload.scenes) ? payload.scenes as Array<Record<string, unknown>> : [];
    if (!savedScenes.length || savedScenes.some(scene => !hasProjectApproval(user.id, project.id, "image", String(scene.id)))) return NextResponse.json({ error: "Approve every current scene image before generating voice." }, { status: 409, headers: { "cache-control": "no-store" } });

    const savedSettings = payload.settings && typeof payload.settings === "object" && !Array.isArray(payload.settings) ? payload.settings as Record<string, unknown> : {};
    const globalVoiceSettings = payload.voiceSettings && typeof payload.voiceSettings === "object" && !Array.isArray(payload.voiceSettings) ? payload.voiceSettings as Record<string, unknown> : {};
    const voiceFormat = payload.voiceFormat;
    if (!(voiceFormat === "narration" || voiceFormat === "dialogue" || voiceFormat === "mixed")) return NextResponse.json({ error: "The saved project has no valid voice format." }, { status: 400, headers: { "cache-control": "no-store" } });
    const spendingLimitMyr = typeof payload.voiceSpendingLimitMyr === "number" ? payload.voiceSpendingLimitMyr : 0;
    if (!Number.isFinite(spendingLimitMyr) || spendingLimitMyr < 0) return NextResponse.json({ error: "The saved project voice limit is invalid." }, { status: 400, headers: { "cache-control": "no-store" } });

    const requested = input.scenes as Array<{ id: string; sceneId: string }>;
    const seen = new Set<string>();
    const scenes = [];
    for (const selection of requested) {
      const key = `${selection.sceneId}\u0000${selection.id}`;
      if (seen.has(key)) return NextResponse.json({ error: "Duplicate voice segment identifiers are not allowed." }, { status: 400, headers: { "cache-control": "no-store" } });
      seen.add(key);
      const scene = savedScenes.find(candidate => candidate.id === selection.sceneId);
      const segments = Array.isArray(scene?.voiceSegments) ? scene.voiceSegments as Array<Record<string, unknown>> : [];
      const segment = segments.find(candidate => candidate.id === selection.id);
      if (!scene || !segment || segment.needsGeneration !== true || typeof segment.text !== "string" || !segment.text.trim() || segment.approved === true || hasProjectApproval(user.id, project.id, "voice", selection.id)) {
        return NextResponse.json({ error: "Voice generation must match a saved, unapproved segment that needs generation." }, { status: 409, headers: { "cache-control": "no-store" } });
      }
      const lineSettings = segment.settings && typeof segment.settings === "object" && !Array.isArray(segment.settings) ? segment.settings as Record<string, unknown> : {};
      const settings = { ...defaultVoiceSettings, ...globalVoiceSettings, ...lineSettings };
      scenes.push({
        id: selection.id,
        sceneId: selection.sceneId,
        text: segment.text,
        voiceId: typeof segment.profileId === "string" ? segment.profileId : "default",
        kind: Array.isArray(segment.versions) && segment.versions.length ? "regeneration" as const : "initial" as const,
        imageApproved: true as const,
        settings,
      });
    }

    const generationRequest = {
      provider: "simulated" as const,
      projectId: project.id,
      scenesApproved: true as const,
      format: voiceFormat,
      aspectRatio: savedSettings.aspectRatio,
      spendingLimitMyr,
      settings: scenes[0].settings,
      scenes,
    };
    if (!validateVoiceGenerationRequest(generationRequest)) return NextResponse.json({ error: "Saved voice inputs are incomplete or invalid." }, { status: 400, headers: { "cache-control": "no-store" } });

    // The server endpoint remains simulated-only. Client-supplied provider fields are ignored.
    const provider = new SimulatedVoiceProvider();
    const results = [];
    for (const scene of generationRequest.scenes) results.push(await provider.generate({ ownerId: user.id, id: scene.id, text: scene.text, voiceId: scene.voiceId, settings: scene.settings, spendingLimitMyr }));
    return NextResponse.json({ provider: provider.id, results }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Voice generation failed. Check the saved project and retry." }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
