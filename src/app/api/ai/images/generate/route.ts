import { NextResponse } from "next/server";
import { getImageProvider } from "@/lib/image-provider";
import { validateImageGenerationRequest } from "@/lib/image-workflow";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 4 * 1024 * 1024) return NextResponse.json({ error: "Image request is too large." }, { status: 413 });
    const body: unknown = JSON.parse(raw);
    if (!validateImageGenerationRequest(body)) return NextResponse.json({ error: "Invalid image request. Approve the script and check the aspect ratio, prompts, and scene review states." }, { status: 400 });

    const provider = getImageProvider();
    if (body.scenes.length > provider.capabilities.maxBatchSize) return NextResponse.json({ error: `This provider supports batches of up to ${provider.capabilities.maxBatchSize} images.` }, { status: 400 });
    const estimatedCostMyr = provider.estimateCost(body.scenes.length);
    if (estimatedCostMyr === null) return NextResponse.json({ error: "Provider pricing is unknown. Live generation is blocked until a per-image MYR price is configured." }, { status: 503 });
    if (estimatedCostMyr > body.spendingLimitMyr) return NextResponse.json({ error: "This project's image spending limit would be exceeded." }, { status: 402 });

    const results = [];
    for (const scene of body.scenes) {
      results.push(await provider.generate({ ...scene, aspectRatio: body.aspectRatio, spendingLimitMyr: body.spendingLimitMyr }));
    }
    return NextResponse.json({ provider: provider.id, capabilities: provider.capabilities, results, estimatedCostMyr, actualCostMyr: provider.id === "simulated" ? 0 : null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image generation failed. Please retry the scene.";
    const status = message.includes("disabled") || message.includes("not configured") || message.includes("pricing is unknown") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
