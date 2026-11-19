import "server-only";
import { estimateImageCostMyr, type AspectRatio } from "@/lib/image-workflow";
import { validateFluxOutputUrl } from "@/lib/flux-url-safety";

export type ImageRequest = { id: string; prompt: string; scriptText: string; aspectRatio: AspectRatio; spendingLimitMyr: number };
export type ImageResult = { id: string; imageDataUrl: string; provider: "simulated" | "flux-schnell"; nativeWidth: number; nativeHeight: number; requestedWidth: number; requestedHeight: number; estimatedCostMyr: number | null; actualCostMyr: number | null };
export type ImageProvider = {
  readonly id: "simulated" | "flux-schnell";
  readonly capabilities: { referenceImageConditioning: boolean; supportedAspectRatios: AspectRatio[]; maxBatchSize: number };
  estimateCost(count: number): number | null;
  generate(input: ImageRequest): Promise<ImageResult>;
};

const requestedSize = (ratio: AspectRatio) => ratio === "9:16" ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
const nativeSize = (ratio: AspectRatio) => ratio === "9:16" ? { width: 576, height: 1024 } : { width: 1024, height: 576 };
const svgData = (prompt: string, ratio: AspectRatio, uniqueId: string) => {
  const { width, height } = requestedSize(ratio);
  const short = prompt.replace(/<[^>]*>/g, "").slice(0, 160).replace(/[&<>"']/g, " ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-generation="${uniqueId.replace(/[^a-zA-Z0-9_-]/g, "")}"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#162620"/><stop offset="1" stop-color="#647343"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="8%" y="12%" fill="#d3ed9d" font-family="sans-serif" font-size="${Math.round(width/24)}">SIMULATED IMAGE</text><text x="8%" y="50%" fill="#f1f3e7" font-family="sans-serif" font-size="${Math.round(width/32)}">${short}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
};

export class SimulatedImageProvider implements ImageProvider {
  readonly id = "simulated" as const;
  readonly capabilities = { referenceImageConditioning: false, supportedAspectRatios: ["9:16", "16:9"] as AspectRatio[], maxBatchSize: 100 };
  estimateCost(count: number) { return estimateImageCostMyr(count, this.id); }
  async generate(input: ImageRequest): Promise<ImageResult> {
    if (input.prompt.includes("[simulate-failure]")) throw new Error("Simulated image generation failed. Edit the prompt or retry the scene.");
    const requested = requestedSize(input.aspectRatio);
    const native = nativeSize(input.aspectRatio);
    return { id: input.id, imageDataUrl: svgData(input.prompt, input.aspectRatio, input.id), provider: this.id, nativeWidth: native.width, nativeHeight: native.height, requestedWidth: requested.width, requestedHeight: requested.height, estimatedCostMyr: 0, actualCostMyr: 0 };
  }
}

/** Server-only BFL FLUX.1 [schnell] adapter. Live calls stay blocked until separately authorized. */
export class FluxSchnellImageProvider implements ImageProvider {
  readonly id = "flux-schnell" as const;
  readonly capabilities = { referenceImageConditioning: false, supportedAspectRatios: ["9:16", "16:9"] as AspectRatio[], maxBatchSize: 8 };
  estimateCost(count: number) {
    const price = Number(process.env.CCAI_FLUX_PRICE_MYR_PER_IMAGE);
    return estimateImageCostMyr(count, this.id, Number.isFinite(price) && price > 0 ? price : undefined);
  }

  async generate(input: ImageRequest): Promise<ImageResult> {
    if (process.env.CCAI_ENABLE_LIVE_IMAGES !== "true" || process.env.CCAI_LIVE_IMAGES_APPROVED !== "true") {
      throw new Error("Live image generation is disabled. Use simulated images or obtain separate approval before enabling API calls.");
    }
    const key = process.env.FLUX_API_KEY;
    if (!key) throw new Error("FLUX is not configured. Add the API key to the server environment.");
    const estimatedCostMyr = this.estimateCost(1);
    if (estimatedCostMyr === null) throw new Error("FLUX pricing is unknown. Configure the per-image MYR price before enabling live generation.");
    if (estimatedCostMyr > input.spendingLimitMyr) throw new Error("This project's image spending limit would be exceeded.");
    if (input.spendingLimitMyr <= 0) throw new Error("Set a project spending limit before live generation.");

    // FLUX Schnell reference-image conditioning is not advertised or sent. Request a conservative
    // 1K native size (multiples of 32) at the requested ratio; the UI can crop/upscale to Full HD.
    const native = nativeSize(input.aspectRatio);
    const requested = requestedSize(input.aspectRatio);
    const response = await fetch("https://api.bfl.ai/v1/flux-schnell", {
      method: "POST",
      headers: { "content-type": "application/json", "x-key": key },
      body: JSON.stringify({ prompt: input.prompt, width: native.width, height: native.height, output_format: "png" }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`FLUX request failed (${response.status}). Please retry the scene.`);
    const task = await response.json() as { polling_url?: string };
    if (!task.polling_url) throw new Error("FLUX did not return a generation task.");
    const pollingUrl = new URL(task.polling_url);
    if (pollingUrl.protocol !== "https:" || pollingUrl.hostname !== "api.bfl.ai") throw new Error("FLUX returned an untrusted polling URL.");

    let sampleUrl = "";
    for (let attempt = 0; attempt < 90; attempt++) {
      const poll = await fetch(pollingUrl, { headers: { "x-key": key }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (!poll.ok) throw new Error(`FLUX task check failed (${poll.status}).`);
      const status = await poll.json() as { status?: string; result?: { sample?: string }; error?: string };
      if (status.status === "Ready" && status.result?.sample) { sampleUrl = status.result.sample; break; }
      if (status.status && !["Pending", "Processing", "Queued"].includes(status.status)) throw new Error(status.error || `FLUX task ended with status ${status.status}.`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!sampleUrl) throw new Error("FLUX generation timed out. Retry the failed scene.");
    const allowedOutputHosts=(process.env.CCAI_FLUX_OUTPUT_HOSTS||"").split(",");
    const imageUrl=validateFluxOutputUrl(sampleUrl,allowedOutputHosts);
    const imageResponse = await fetch(imageUrl, { cache: "no-store", redirect:"error", signal: AbortSignal.timeout(20_000) });
    if (!imageResponse.ok) throw new Error("Could not retrieve the generated image. Retry the scene.");
    const type = imageResponse.headers.get("content-type") || "";
    if (!/^image\/(png|jpeg|webp)$/.test(type)) throw new Error("FLUX returned an unsupported image format.");
    const bytes = Buffer.from(await imageResponse.arrayBuffer());
    if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error("FLUX returned an invalid image size.");
    return { id: input.id, imageDataUrl: `data:${type};base64,${bytes.toString("base64")}`, provider: this.id, nativeWidth: native.width, nativeHeight: native.height, requestedWidth: requested.width, requestedHeight: requested.height, estimatedCostMyr, actualCostMyr: null };
  }
}

export function getImageProvider(): ImageProvider {
  return process.env.CCAI_IMAGE_PROVIDER === "flux-schnell" ? new FluxSchnellImageProvider() : new SimulatedImageProvider();
}
