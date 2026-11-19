export type VoiceJobStatus = "pending" | "generating" | "completed" | "failed" | "cancelled";
export type VoiceDecision = "approve" | "reject" | null;
export type VoiceMode = "narration" | "dialogue" | "mixed";
export type VoiceSettings = { speed: number; stability: number; similarity: number; emotion: string; styleExaggeration: number; pronunciation: string };
export type VoiceScene = {
  id: string; line: string; seconds: number; image: string | null; approved: boolean;
  voiceSegments?: Array<{ id: string; status: string; approved: boolean; durationSeconds: number; dataUrl?: string; versions?: Array<{ dataUrl?: string }>; needsGeneration?: boolean }>;
};
export type VoiceJob = { id: string; sceneId: string; segmentId?: string; status: VoiceJobStatus; progress: number; kind: "initial" | "regeneration" | "retry"; createdAt: string; error?: string };
export const defaultVoiceSettings: VoiceSettings = { speed: 1, stability: 0.55, similarity: 0.75, emotion: "Neutral", styleExaggeration: 0.2, pronunciation: "" };

export function canGenerateVoice(scenes: VoiceScene[]): boolean {
  return scenes.length > 0 && scenes.every((scene) => scene.approved && Boolean(scene.image));
}

export function voiceIsComplete(scenes: VoiceScene[]): boolean {
  return canGenerateVoice(scenes) && scenes.every((scene) => Boolean(scene.voiceSegments?.length) && scene.voiceSegments!.every((audio) => audio.approved && !audio.needsGeneration && audio.status === "completed" && audio.durationSeconds > 0 && Boolean(audio.dataUrl || audio.versions?.some((version) => version.dataUrl))));
}

export function estimateSpeechSeconds(text: string, speed = 1, wordsPerMinute = 150): number {
  if (typeof text !== "string" || !Number.isFinite(speed) || speed < 0.5 || speed > 2 || !Number.isFinite(wordsPerMinute) || wordsPerMinute <= 0) throw new Error("Invalid voice duration inputs.");
  const cleaned = text.trim();
  if (!cleaned) return 0;
  const locale = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "word" }) : null;
  const count = locale ? Array.from(locale.segment(cleaned)).filter((part) => part.isWordLike).length : (cleaned.match(/[\p{L}\p{N}]+/gu) || []).length;
  return Math.max(0.5, Number((count / (wordsPerMinute * speed) * 60).toFixed(2)));
}

/** A confirmed voice decision changes only explicitly rejected scenes. */
export function confirmVoiceDecisions<T extends { id: string; approved: boolean; decision: VoiceDecision }>(scenes: T[]) {
  const rejectedIds: string[] = [];
  const next = scenes.map((scene) => {
    if (scene.approved) return scene;
    if (scene.decision === "approve") return { ...scene, approved: true, decision: null };
    if (scene.decision === "reject") { rejectedIds.push(scene.id); return { ...scene, approved: false, decision: null }; }
    return scene;
  });
  return { scenes: next, rejectedIds };
}

/** Keep chronological order and replace each clip duration with its measured audio length. */
export function synchronizeAudioDurations<T extends { id: string; seconds: number; voiceSegments?: Array<{ durationSeconds: number }> }>(scenes: T[]) {
  return scenes.map((scene) => {
    const duration = scene.voiceSegments?.reduce((sum, segment) => sum + segment.durationSeconds, 0) || 0;
    return duration > 0 ? { ...scene, seconds: Number(duration.toFixed(2)) } : scene;
  });
}

export function estimateVoiceCredits(characters: number, provider: "simulated" | "elevenlabs", creditsPerCharacter?: number): number | null {
  if (!Number.isSafeInteger(characters) || characters < 0 || characters > 1_000_000) throw new Error("Character count must be between 0 and 1,000,000.");
  if (provider === "simulated") return 0;
  if (!Number.isFinite(creditsPerCharacter) || (creditsPerCharacter as number) <= 0) return null;
  return Math.ceil(characters * (creditsPerCharacter as number));
}

export function estimateVoiceCostMyr(credits: number | null, myrPerThousandCredits?: number): number | null {
  if (credits === null || !Number.isFinite(myrPerThousandCredits) || (myrPerThousandCredits as number) <= 0) return null;
  return Number(((credits * (myrPerThousandCredits as number)) / 1000).toFixed(4));
}

export function deduplicateVoiceJobs(existing: VoiceJob[], incoming: VoiceJob[]): VoiceJob[] {
  const key = (job: VoiceJob) => `${job.sceneId}:${job.segmentId || job.sceneId}`;
  const active = new Set(existing.filter((job) => job.status === "pending" || job.status === "generating").map(key));
  const result = [...existing];
  for (const job of incoming) if (!active.has(key(job))) { result.push(job); active.add(key(job)); }
  return result;
}

export function recoverVoiceJobs<T extends VoiceJob>(jobs: T[]): T[] {
  return jobs.map((job) => job.status === "generating" ? { ...job, status: "pending", progress: 0 } : job);
}

export function validateVoiceGenerationRequest(value: unknown): value is {
  provider: "simulated" | "elevenlabs"; projectId: string; scenesApproved: true; format: VoiceMode; aspectRatio: "9:16" | "16:9";
  spendingLimitMyr: number; settings: VoiceSettings; scenes: Array<{ id: string; sceneId: string; text: string; voiceId: string; kind: "initial" | "regeneration" | "retry"; imageApproved: true }>;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  if (!(input.provider === "simulated" || input.provider === "elevenlabs") || typeof input.projectId !== "string" || !input.projectId || input.projectId.length > 120 || input.scenesApproved !== true || !["narration", "dialogue", "mixed"].includes(String(input.format))) return false;
  if (!(input.aspectRatio === "9:16" || input.aspectRatio === "16:9") || !Number.isFinite(input.spendingLimitMyr) || Number(input.spendingLimitMyr) < 0) return false;
  const settings = input.settings as Record<string, unknown> | undefined;
  if (!settings || !Number.isFinite(settings.speed) || Number(settings.speed) < 0.5 || Number(settings.speed) > 2 || !Number.isFinite(settings.stability) || Number(settings.stability) < 0 || Number(settings.stability) > 1 || !Number.isFinite(settings.similarity) || Number(settings.similarity) < 0 || Number(settings.similarity) > 1 || !Number.isFinite(settings.styleExaggeration) || Number(settings.styleExaggeration) < 0 || Number(settings.styleExaggeration) > 1 || typeof settings.emotion !== "string" || settings.emotion.length > 80 || typeof settings.pronunciation !== "string" || settings.pronunciation.length > 5000) return false;
  if (!Array.isArray(input.scenes) || !input.scenes.length || input.scenes.length > 100) return false;
  const ids = new Set<string>();
  return input.scenes.every((raw) => {
    if (!raw || typeof raw !== "object") return false;
    const scene = raw as Record<string, unknown>;
    if (typeof scene.id !== "string" || !scene.id || ids.has(scene.id)) return false;
    ids.add(scene.id);
    return typeof scene.sceneId === "string" && scene.sceneId.length <= 120 && typeof scene.text === "string" && scene.text.trim().length > 0 && scene.text.length <= 12000 && typeof scene.voiceId === "string" && scene.voiceId.length <= 120 && ["initial", "regeneration", "retry"].includes(String(scene.kind)) && scene.imageApproved === true;
  });
}
