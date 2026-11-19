import { NextResponse } from "next/server";
import { getImageProvider } from "@/lib/image-provider";
import { getProject } from "@/lib/project-store";
import { imageRequestFromSavedProject } from "@/lib/ai-generation-gates";
import { validateImageGenerationRequest } from "@/lib/image-workflow";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 16 * 1024) return NextResponse.json({ error: "Image request is too large." }, { status: 413 });
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "A saved project ID and scene IDs are required." }, { status: 400 });
    const input = body as Record<string, unknown>;
    if (typeof input.projectId !== "string" || !input.projectId) return NextResponse.json({ error: "A saved project ID is required." }, { status: 400 });
    if (!Array.isArray(input.sceneIds)) return NextResponse.json({ error: "Selected scene IDs are required." }, { status: 400 });
    const project = getProject(input.projectId);
    if (!project) return NextResponse.json({ error: "Saved project not found." }, { status: 404 });
    const generationRequest = imageRequestFromSavedProject(project.payload, input.sceneIds);
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
