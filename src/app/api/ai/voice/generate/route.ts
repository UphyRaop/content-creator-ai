import { NextResponse } from "next/server";
import { getVoiceProvider, SimulatedVoiceProvider } from "@/lib/voice-provider";
import { estimateVoiceCostMyr, estimateVoiceCredits, validateVoiceGenerationRequest } from "@/lib/voice-workflow";
import { getProject } from "@/lib/project-store";
import { recordVoiceUsage, verifyVoiceVaultAdminToken } from "@/lib/voice-vault";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 4 * 1024 * 1024) return NextResponse.json({ error: "Voice request is too large." }, { status: 413 });
    const body: unknown = JSON.parse(raw);
    if (!validateVoiceGenerationRequest(body)) return NextResponse.json({ error: "Invalid voice request. Approve every scene image and check the script, voice settings, and format." }, { status: 400 });
    const input = body;
    const project = getProject(input.projectId);
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    const payload = project.payload;
    const persistedScenes = Array.isArray(payload.scenes) ? payload.scenes as Array<Record<string, unknown>> : [];
    if (payload.scriptApproved !== true || !persistedScenes.length || persistedScenes.some(scene => scene.approved !== true || !scene.image)) return NextResponse.json({ error: "Every scene image must be approved in the saved project before voice generation." }, { status: 409 });
    for (const requested of input.scenes) {
      const scene = persistedScenes.find(item => item.id === requested.sceneId);
      const lines = Array.isArray(scene?.voiceSegments) ? scene.voiceSegments as Array<Record<string, unknown>> : [];
      const line = lines.find(item => item.id === requested.id);
      if (!scene || !line || line.approved === true || line.needsGeneration !== true || line.text !== requested.text) return NextResponse.json({ error: "Voice request must match a saved, unapproved line in this project." }, { status: 409 });
    }
    const projectLimit = Number(payload.voiceSpendingLimitMyr || 0);
    if (input.spendingLimitMyr > projectLimit) return NextResponse.json({ error: "The voice request exceeds the saved project limit." }, { status: 402 });
    if (input.provider === "elevenlabs") {
      const authorization = request.headers.get("authorization") || "";
      const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : null;
      if (!verifyVoiceVaultAdminToken(token)) return NextResponse.json({ error: "Voice generation requires secure administrator authorization." }, { status: 401 });
      const creditsPerCharacter = Number(process.env.CCAI_ELEVENLABS_CREDITS_PER_CHARACTER || "");
      const myrPerThousandCredits = Number(process.env.CCAI_ELEVENLABS_MYR_PER_1000_CREDITS || "");
      const totalCharacters = input.scenes.reduce((sum, scene) => sum + scene.text.length, 0);
      const totalCredits = estimateVoiceCredits(totalCharacters, "elevenlabs", creditsPerCharacter);
      const totalCostMyr = estimateVoiceCostMyr(totalCredits, myrPerThousandCredits);
      if (totalCredits === null || totalCostMyr === null) return NextResponse.json({ error: "Current ElevenLabs credit and MYR pricing are unknown; live generation is blocked." }, { status: 503 });
      if (input.spendingLimitMyr <= 0 || totalCostMyr > input.spendingLimitMyr || totalCostMyr > projectLimit) return NextResponse.json({ error: "Estimated batch voice cost exceeds the saved project spending limit." }, { status: 402 });
    }
    const provider = input.provider === "simulated" ? new SimulatedVoiceProvider() : getVoiceProvider();
    if (input.provider === "elevenlabs" && provider.id !== "elevenlabs") return NextResponse.json({ error: "ElevenLabs is not the selected provider." }, { status: 503 });
    const results = [];
    for (const scene of input.scenes) {
      const result = await provider.generate({ id: scene.id, text: scene.text, voiceId: scene.voiceId, settings: input.settings, spendingLimitMyr: input.spendingLimitMyr });
      if (result.provider === "elevenlabs") recordVoiceUsage({ projectId: input.projectId, accountId: result.accountId, kind: scene.kind, characters: result.characters, estimatedCredits: result.credits || 0, estimatedCostMyr: result.estimatedCostMyr || 0, actualCostMyr: result.actualCostMyr });
      results.push(result);
    }
    return NextResponse.json({ provider: provider.id, results }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Voice generation failed. Please retry.";
    const status = message.includes("disabled") || message.includes("unknown") || message.includes("not configured") ? 503 : 502;
    return NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
  }
}
