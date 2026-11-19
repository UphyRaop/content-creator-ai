import { NextResponse } from "next/server";
import { getImageProvider } from "@/lib/image-provider";
import { getOwnedProject } from "@/lib/project-store";
import { getSessionUser, isSameOriginMutation } from "@/lib/auth";
import { hasProjectApproval } from "@/lib/approval-store";
import { imageRequestFromSavedProject } from "@/lib/ai-generation-gates";
import { validateImageGenerationRequest } from "@/lib/image-workflow";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Cross-origin mutation rejected." }, { status: 403 });
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 16 * 1024) return NextResponse.json({ error: "Image request is too large." }, { status: 413 });
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "A saved project ID and scene IDs are required." }, { status: 400 });
    const input = body as Record<string, unknown>;
    if (typeof input.projectId !== "string" || !input.projectId) return NextResponse.json({ error: "A saved project ID is required." }, { status: 400 });
    if (!Array.isArray(input.sceneIds) || input.sceneIds.length < 1 || input.sceneIds.length > 100 || input.sceneIds.some(id => typeof id !== "string" || !id.trim() || id.length > 120) || new Set(input.sceneIds).size !== input.sceneIds.length) return NextResponse.json({ error: "Selected scene IDs are invalid." }, { status: 400 });
    const project = getOwnedProject(user.id, input.projectId);
    if (!project) return NextResponse.json({ error: "Saved project not found." }, { status: 404 });
    if (!hasProjectApproval(user.id, project.id, "script")) return NextResponse.json({ error: "Approve the current saved script before generating scene images." }, { status: 409 });
    for (const sceneId of input.sceneIds) {
      if (typeof sceneId === "string" && hasProjectApproval(user.id, project.id, "image", sceneId)) return NextResponse.json({ error: "An approved scene image cannot be regenerated." }, { status: 409 });
    }
    const sceneIds = new Set(input.sceneIds.filter((id): id is string => typeof id === "string"));
    const savedScenes = Array.isArray(project.payload.scenes) ? project.payload.scenes : [];
    const payload = {
      ...project.payload,
      scriptApproved: true,
      scenes: savedScenes.map(raw => {
        if (!raw || typeof raw !== "object" || !sceneIds.has(String((raw as Record<string, unknown>).id))) return raw;
        const scene = raw as Record<string, unknown>;
        return { ...scene, approved: false, approvalStatus: scene.approvalStatus === "rejected" ? "rejected" : "pending" };
      }),
    };
    const generationRequest = imageRequestFromSavedProject(payload, input.sceneIds);
    if (!validateImageGenerationRequest(generationRequest)) return NextResponse.json({ error: "Saved image inputs are incomplete or invalid." }, { status: 400 });

    const provider = getImageProvider();
    if (generationRequest.scenes.length > provider.capabilities.maxBatchSize) return NextResponse.json({ error: `This provider supports batches of up to ${provider.capabilities.maxBatchSize} images.` }, { status: 400 });
    const estimatedCostMyr = provider.estimateCost(generationRequest.scenes.length);
    if (estimatedCostMyr === null) return NextResponse.json({ error: "Provider pricing is unknown. Live generation is blocked until a per-image MYR price is configured." }, { status: 503 });
    if (estimatedCostMyr > generationRequest.spendingLimitMyr) return NextResponse.json({ error: "This project's image spending limit would be exceeded." }, { status: 402 });

    const results = [];
    for (const scene of generationRequest.scenes) {
      results.push(await provider.generate({ ...scene, aspectRatio: generationRequest.aspectRatio, spendingLimitMyr: generationRequest.spendingLimitMyr }));
    }
    return NextResponse.json({ provider: provider.id, capabilities: provider.capabilities, results, estimatedCostMyr, actualCostMyr: provider.id === "simulated" ? 0 : null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image generation failed. Please retry the scene.";
    const status = message.includes("Approve the saved") ? 409
      : message.includes("exceeds") ? 402
      : message.includes("disabled") || message.includes("not configured") || message.includes("pricing is unknown") ? 503
      : /request failed|generation failed/i.test(message) ? 502
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
