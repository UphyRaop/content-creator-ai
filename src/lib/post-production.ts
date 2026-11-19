/** Pure post-production audio model. Imported media and the original render are never modified here. */
export type PostAudioKind = "music" | "voice-recording" | "sound-effect";
export type DuckingSettings = {
  enabled: boolean;
  amount: number;
  threshold: number;
  attackSeconds: number;
  releaseSeconds: number;
  targetTrackIds: string[];
};
export type PostAudioTrack = {
  id: string;
  kind: PostAudioKind;
  sourceRef: string;
  actualDurationSeconds: number;
  waveformPeaks?: number[];
  enabled: boolean;
  startSeconds: number;
  sourceOffsetSeconds: number;
  durationSeconds: number;
  volume: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  /** Always explicit; new music layers start disabled, with ducking disabled. */
  ducking: DuckingSettings;
};
export type OriginalRender = { id: string; version: string; sourceRef: string; durationSeconds: number };
export type PostProductionRevision = {
  id: string;
  revisionNumber: number;
  parentRenderId: string;
  parentRenderVersion: string;
  parentRevisionId: string | null;
  originalRenderRef: string;
  createdAt: string;
  audioTracks: PostAudioTrack[];
  derivedVideoRef: string | null;
};
export type PostProductionProject = {
  version: 1;
  originalRender: OriginalRender;
  revisions: PostProductionRevision[];
  activeRevisionId: string | null;
};
export type DerivedAudioTrack = {
  id: string;
  kind: PostAudioKind;
  sourceRef: string;
  startSeconds: number;
  sourceOffsetSeconds: number;
  durationSeconds: number;
  endSeconds: number;
  volume: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  ducking: DuckingSettings;
};
export type DerivedAudioTimeline = {
  parentRenderId: string;
  parentRenderVersion: string;
  originalRenderRef: string;
  videoDurationSeconds: number;
  outputDurationSeconds: number;
  tracks: DerivedAudioTrack[];
};

const MAX_DURATION = 3600;
const MAX_TRACKS = 100;
const MAX_WAVEFORM_POINTS = 2000;

export function createPostAudioTrack(input: {
  id: string; kind: PostAudioKind; sourceRef: string; actualDurationSeconds: number;
  waveformPeaks?: number[];
}): PostAudioTrack {
  const track: PostAudioTrack = {
    id: input.id, kind: input.kind, sourceRef: input.sourceRef,
    actualDurationSeconds: input.actualDurationSeconds,
    ...(input.waveformPeaks === undefined ? {} : { waveformPeaks: [...input.waveformPeaks] }),
    enabled: input.kind !== "music", startSeconds: 0, sourceOffsetSeconds: 0,
    durationSeconds: input.actualDurationSeconds, volume: 1, fadeInSeconds: 0, fadeOutSeconds: 0,
    ducking: { enabled: false, amount: 0.5, threshold: 0.15, attackSeconds: 0.1, releaseSeconds: 0.3, targetTrackIds: [] },
  };
  assertPostAudioTrack(track);
  return track;
}

export function validatePostAudioTrack(value: unknown): value is PostAudioTrack {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const t = value as Record<string, unknown>;
  if (typeof t.id !== "string" || !/^[A-Za-z0-9_-]{1,120}$/.test(t.id) || !["music", "voice-recording", "sound-effect"].includes(String(t.kind)) ||
      typeof t.sourceRef !== "string" || !t.sourceRef.trim() || t.sourceRef.length > 500 || typeof t.enabled !== "boolean") return false;
  if (![t.actualDurationSeconds, t.startSeconds, t.sourceOffsetSeconds, t.durationSeconds, t.volume, t.fadeInSeconds, t.fadeOutSeconds].every(Number.isFinite)) return false;
  const actual = Number(t.actualDurationSeconds), start = Number(t.startSeconds), offset = Number(t.sourceOffsetSeconds), duration = Number(t.durationSeconds);
  if (actual <= 0 || actual > MAX_DURATION || start < 0 || start > MAX_DURATION || offset < 0 || duration <= 0 || duration > MAX_DURATION || offset + duration > actual + 1e-9 || start + duration > MAX_DURATION) return false;
  if (Number(t.volume) < 0 || Number(t.volume) > 2 || Number(t.fadeInSeconds) < 0 || Number(t.fadeOutSeconds) < 0 || Number(t.fadeInSeconds) > 30 || Number(t.fadeOutSeconds) > 30 || Number(t.fadeInSeconds) + Number(t.fadeOutSeconds) > duration + 1e-9) return false;
  if (t.waveformPeaks !== undefined && (!Array.isArray(t.waveformPeaks) || t.waveformPeaks.length > MAX_WAVEFORM_POINTS || t.waveformPeaks.some(x => typeof x !== "number" || !Number.isFinite(x) || x < 0 || x > 1))) return false;
  const d = t.ducking;
  if (!d || typeof d !== "object" || Array.isArray(d)) return false;
  const duck = d as Record<string, unknown>;
  if (typeof duck.enabled !== "boolean" || !Number.isFinite(duck.amount) || Number(duck.amount) < 0 || Number(duck.amount) > 1 ||
      !Number.isFinite(duck.threshold) || Number(duck.threshold) < 0 || Number(duck.threshold) > 1 ||
      !Number.isFinite(duck.attackSeconds) || Number(duck.attackSeconds) < 0 || Number(duck.attackSeconds) > 5 ||
      !Number.isFinite(duck.releaseSeconds) || Number(duck.releaseSeconds) < 0 || Number(duck.releaseSeconds) > 10 ||
      !Array.isArray(duck.targetTrackIds) || duck.targetTrackIds.length > MAX_TRACKS || duck.targetTrackIds.some(id => typeof id !== "string" || !/^[A-Za-z0-9_-]{1,120}$/.test(id))) return false;
  if (duck.enabled && (Number(duck.amount) <= 0 || duck.targetTrackIds.length === 0)) return false;
  const targetTrackIds = duck.targetTrackIds as string[];
  if (targetTrackIds.some((id, i) => targetTrackIds.indexOf(id) !== i || id === t.id)) return false;
  return true;
}
export function assertPostAudioTrack(value: unknown): asserts value is PostAudioTrack {
  if (!validatePostAudioTrack(value)) throw new Error("Invalid post-production audio track, trim, fade, waveform, or ducking settings.");
}

/** Applies an immutable, validated patch to a layer's mix/timing settings. */
export function updatePostAudioTrack(track: PostAudioTrack, patch: Partial<Pick<PostAudioTrack, "enabled" | "startSeconds" | "sourceOffsetSeconds" | "durationSeconds" | "volume" | "fadeInSeconds" | "fadeOutSeconds" | "ducking">>): PostAudioTrack {
  const next = { ...track, ...patch, waveformPeaks: track.waveformPeaks ? [...track.waveformPeaks] : undefined, ducking: patch.ducking ? { ...patch.ducking, targetTrackIds: [...patch.ducking.targetTrackIds] } : { ...track.ducking, targetTrackIds: [...track.ducking.targetTrackIds] } };
  assertPostAudioTrack(next);
  return next;
}

/** Resolves ducking targets only to enabled voice-recording layers. */
export function validatePostAudioTracks(tracks: unknown): tracks is PostAudioTrack[] {
  if (!Array.isArray(tracks) || tracks.length > MAX_TRACKS || !tracks.every(validatePostAudioTrack)) return false;
  const ids = new Set<string>();
  for (const track of tracks) { if (ids.has(track.id)) return false; ids.add(track.id); }
  return tracks.every(track => !track.ducking.enabled || track.ducking.targetTrackIds.every(id => tracks.some(target => target.id === id && target.kind === "voice-recording" && target.enabled)));
}

export function createPostProductionProject(originalRender: OriginalRender): PostProductionProject {
  if (!originalRender || typeof originalRender.id !== "string" || !originalRender.id || typeof originalRender.version !== "string" || !originalRender.version ||
      typeof originalRender.sourceRef !== "string" || !originalRender.sourceRef || !Number.isFinite(originalRender.durationSeconds) || originalRender.durationSeconds <= 0 || originalRender.durationSeconds > MAX_DURATION) throw new Error("Invalid original render reference.");
  return { version: 1, originalRender: { ...originalRender }, revisions: [], activeRevisionId: null };
}

/** Append a derived mix revision; original render identity/ref remain immutable and explicit. */
export function createPostProductionRevision(project: PostProductionProject, input: { id: string; createdAt: string; audioTracks: PostAudioTrack[] }): PostProductionProject {
  if (!project || project.version !== 1 || !input.id || input.id.length > 120 || !input.createdAt || project.revisions.some(r => r.id === input.id)) throw new Error("Invalid or duplicate post-production revision.");
  if (!validatePostAudioTracks(input.audioTracks)) throw new Error("Invalid post-production audio tracks or ducking targets.");
  const revision: PostProductionRevision = {
    id: input.id, revisionNumber: project.revisions.length + 1,
    parentRenderId: project.originalRender.id, parentRenderVersion: project.originalRender.version,
    parentRevisionId: project.activeRevisionId, originalRenderRef: project.originalRender.sourceRef,
    createdAt: input.createdAt, audioTracks: input.audioTracks.map(cloneTrack), derivedVideoRef: null,
  };
  return { ...project, originalRender: { ...project.originalRender }, revisions: [...project.revisions, revision], activeRevisionId: revision.id };
}

export function selectPostProductionRevision(project: PostProductionProject, revisionId: string | null): PostProductionProject {
  if (revisionId !== null && !project.revisions.some(r => r.id === revisionId)) throw new Error("Post-production revision not found.");
  return { ...project, originalRender: { ...project.originalRender }, revisions: project.revisions.map(r => ({ ...r, audioTracks: r.audioTracks.map(cloneTrack) })), activeRevisionId: revisionId };
}

/** Produce an audio mix plan without encoding or modifying source assets/video. Disabled music stays out of the plan. */
export function calculateDerivedAudioTimeline(project: PostProductionProject, revisionId = project.activeRevisionId): DerivedAudioTimeline {
  if (!revisionId) throw new Error("Create a post-production revision before building its audio timeline.");
  const revision = project.revisions.find(r => r.id === revisionId); if (!revision) throw new Error("Post-production revision not found.");
  if (!validatePostAudioTracks(revision.audioTracks)) throw new Error("Post-production revision contains invalid audio tracks.");
  const tracks = revision.audioTracks.filter(t => t.enabled).map(t => ({
    id: t.id, kind: t.kind, sourceRef: t.sourceRef, startSeconds: t.startSeconds,
    sourceOffsetSeconds: t.sourceOffsetSeconds, durationSeconds: t.durationSeconds,
    endSeconds: t.startSeconds + t.durationSeconds, volume: t.volume,
    fadeInSeconds: t.fadeInSeconds, fadeOutSeconds: t.fadeOutSeconds,
    ducking: { ...t.ducking, targetTrackIds: [...t.ducking.targetTrackIds] },
  }));
  const videoDurationSeconds = project.originalRender.durationSeconds;
  return { parentRenderId: revision.parentRenderId, parentRenderVersion: revision.parentRenderVersion,
    originalRenderRef: revision.originalRenderRef, videoDurationSeconds,
    outputDurationSeconds: Math.max(videoDurationSeconds, ...tracks.map(t => t.endSeconds)), tracks };
}

function cloneTrack(track: PostAudioTrack): PostAudioTrack { return { ...track, waveformPeaks: track.waveformPeaks ? [...track.waveformPeaks] : undefined, ducking: { ...track.ducking, targetTrackIds: [...track.ducking.targetTrackIds] } }; }
