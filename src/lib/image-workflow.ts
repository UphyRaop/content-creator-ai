export type AspectRatio = "9:16" | "16:9";
export type ImageReviewStatus = "pending" | "approved" | "rejected";
export type ImageJobStatus = "pending" | "generating" | "completed" | "failed" | "cancelled";
export type SceneDecision = "approve" | "reject" | null;

export type ImageScene = {
  id: string;
  title: string;
  line: string;
  seconds: number;
  prompt: string;
  approvalStatus: ImageReviewStatus;
  approved: boolean;
  decision: SceneDecision;
  generationStatus: ImageJobStatus;
  image?: string | null;
  imageVersions: Array<{ image: string; prompt: string; scriptText: string; aspectRatio: AspectRatio; createdAt: string; provider: string }>;
};

export type ImageJob = {
  id: string;
  sceneId: string;
  status: ImageJobStatus;
  progress: number;
  kind: "initial" | "regeneration" | "retry";
  prompt: string;
  scriptText: string;
  createdAt: string;
  error?: string;
};

const MAX_SCENES = 100;

/** Existing scene images requested again count as regenerations, including input-refresh batches. */
export function imageRequestKind(hasPreviousImage: boolean): "initial" | "regeneration" {
  return hasPreviousImage ? "regeneration" : "initial";
}

function words(text: string, locale = "en"): string[] {
  if (typeof Intl.Segmenter === "function") {
    return Array.from(new Intl.Segmenter(locale, { granularity: "word" }).segment(text))
      .filter((part) => part.isWordLike)
      .map((part) => part.segment);
  }
  return text.match(/[\p{L}\p{N}]+(?:[’'][\p{L}\p{N}]+)*/gu) || [];
}

/** Make chronological scene beats at roughly four seconds each, using approved script text only. */
export function planSceneBreakdown(input: {
  script: string;
  durationSeconds: number;
  visualStyle: string;
  aspectRatio: AspectRatio;
  characters?: string[];
  locations?: string[];
}): ImageScene[] {
  const script = input.script.trim();
  if (!script) throw new Error("Approve a non-empty script before creating scenes.");
  const duration = Math.max(60, Math.min(300, Math.round(input.durationSeconds)));
  const count = Math.min(MAX_SCENES, Math.max(1, Math.ceil(duration / 4)));
  const language = (input as { language?: string }).language || "English";
  const locale = ({ English: "en", Malay: "ms", Chinese: "zh", Tamil: "ta", Spanish: "es", French: "fr", Japanese: "ja", Arabic: "ar" } as Record<string, string>)[language] || "en";
  const content = words(script.replace(/^\[[^\]]+\]\s*/gm, ""), locale);
  const chunkSize = Math.max(1, Math.ceil(content.length / count));
  const style = input.visualStyle.trim() || "cinematic";
  const output: ImageScene[] = [];
  for (let index = 0; index < count; index++) {
    const line = content.slice(index * chunkSize, (index + 1) * chunkSize).join(" ") || `Visual beat ${index + 1}`;
    output.push({
      id: `scene-${index + 1}-${cryptoId()}`,
      title: `Scene ${index + 1}: ${line.split(/\s+/).slice(0, 6).join(" ")}`,
      line,
      seconds: duration / count,
      prompt: `Create a ${style} ${input.aspectRatio} image that shows: ${line}. Preserve chronological story continuity and keep the assigned characters, location, outfit, and brand references consistent.`,
      approvalStatus: "pending",
      approved: false,
      decision: null,
      generationStatus: "pending",
      image: null,
      imageVersions: [],
    });
  }
  return output;
}

function cryptoId(): string {
  return globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Apply only confirmed review choices. Returns rejected scene IDs for explicit regeneration. */
export function confirmSceneDecisions<T extends ImageScene>(scenes: T[]): { scenes: T[]; rejectedIds: string[] } {
  const rejectedIds: string[] = [];
  const next = scenes.map((scene) => {
    if (scene.approved) return scene;
    if (scene.decision === "approve") return { ...scene, approved: true, approvalStatus: "approved" as const, decision: null };
    if (scene.decision === "reject") {
      rejectedIds.push(scene.id);
      return { ...scene, approved: false, approvalStatus: "rejected" as const, decision: null };
    }
    return scene;
  });
  return { scenes: next, rejectedIds };
}

export function canGenerateVoice(scenes: Array<Pick<ImageScene, "approved" | "image">>): boolean {
  return scenes.length > 0 && scenes.every((scene) => scene.approved && Boolean(scene.image));
}

/** Recover persisted in-flight simulated jobs as pending; never start them on load. */
export function recoverImageJobs<T extends ImageJob>(jobs: T[]): T[] {
  return jobs.map((job) => job.status === "generating" ? { ...job, status: "pending", progress: 0 } : job);
}

/** Prevent a second live/pending request for the same scene. */
export function deduplicateImageJobs(existing: ImageJob[], incoming: ImageJob[]): ImageJob[] {
  const active = new Set(existing.filter((job) => job.status === "pending" || job.status === "generating").map((job) => job.sceneId));
  return incoming.filter((job) => {
    if (active.has(job.sceneId)) return false;
    active.add(job.sceneId);
    return true;
  });
}

/** Unknown live pricing is null, never presented as RM0. */
export function estimateImageCostMyr(count: number, provider: "simulated" | "flux-schnell", pricePerImageMyr?: number): number | null {
  if (!Number.isSafeInteger(count) || count < 0 || count > MAX_SCENES) throw new Error("Image count must be between 0 and 100.");
  if (provider === "simulated") return 0;
  if (!Number.isFinite(pricePerImageMyr) || (pricePerImageMyr as number) <= 0) return null;
  return Number((count * (pricePerImageMyr as number)).toFixed(4));
}

export function validateImageGenerationRequest(value: unknown): value is {
  scriptApproved: true;
  aspectRatio: AspectRatio;
  spendingLimitMyr: number;
  scenes: Array<{ id: string; prompt: string; scriptText: string; approvalStatus: ImageReviewStatus }>;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  if (request.scriptApproved !== true || !["9:16", "16:9"].includes(String(request.aspectRatio))) return false;
  if (!Number.isFinite(request.spendingLimitMyr) || Number(request.spendingLimitMyr) < 0) return false;
  if (!Array.isArray(request.scenes) || request.scenes.length < 1 || request.scenes.length > MAX_SCENES) return false;
  const ids = new Set<string>();
  return request.scenes.every((raw) => {
    if (!raw || typeof raw !== "object") return false;
    const scene = raw as Record<string, unknown>;
    if (typeof scene.id !== "string" || !scene.id || ids.has(scene.id)) return false;
    ids.add(scene.id);
    return typeof scene.prompt === "string" && scene.prompt.trim().length > 0 && scene.prompt.length <= 12000 &&
      typeof scene.scriptText === "string" && scene.scriptText.length <= 12000 &&
      ["pending", "rejected"].includes(String(scene.approvalStatus));
  });
}

/** Geometry for a no-distortion cover crop. x/y are focal points from 0 to 1. */
export function coverCrop(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number, x = 0.5, y = 0.5) {
  if (![sourceWidth, sourceHeight, targetWidth, targetHeight].every((n) => Number.isFinite(n) && n > 0)) throw new Error("Image dimensions must be positive numbers.");
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  let width = sourceWidth;
  let height = sourceHeight;
  if (sourceRatio > targetRatio) width = sourceHeight * targetRatio;
  else height = sourceWidth / targetRatio;
  const focalX = Math.max(0, Math.min(1, x));
  const focalY = Math.max(0, Math.min(1, y));
  return { sx: (sourceWidth - width) * focalX, sy: (sourceHeight - height) * focalY, sw: width, sh: height, dw: targetWidth, dh: targetHeight };
}
