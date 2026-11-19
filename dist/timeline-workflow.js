const MAX_TRACKS = 16, MAX_CLIPS = 1000, MAX_TIME = 3600;
const kinds = ["image", "narration", "dialogue", "caption"];
export function createTimeline() {
    return { version: 1, timeUnit: "seconds", tracks: kinds.map(kind => ({ id: `track-${kind}`, kind, clips: [] })), estimatedDuration: 0, actualAudioDuration: null, renderApproval: { approved: false } };
}
function copy(value) { return JSON.parse(JSON.stringify(value)); }
function clipIndex(t, trackId, clipId) {
    const track = t.tracks.find(x => x.id === trackId);
    if (!track)
        throw new Error("Timeline track not found.");
    const index = track.clips.findIndex(x => x.id === clipId);
    if (index < 0)
        throw new Error("Timeline clip not found.");
    return { track, index };
}
function normalize(t) {
    for (const track of t.tracks) {
        track.clips = track.clips.map(c => ({ ...c, start: ms(c.start), duration: ms(c.duration), sourceOffset: ms(c.sourceOffset), ...(c.transitionDuration === undefined ? {} : { transitionDuration: ms(c.transitionDuration) }), ...(c.motionDuration === undefined ? {} : { motionDuration: ms(c.motionDuration) }) })).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    }
    t.estimatedDuration = ms(Math.max(0, ...t.tracks.flatMap(x => x.clips.map(c => c.start + c.duration))));
    t.renderApproval = { approved: false };
    return t;
}
function noSpeechOverlap(t) {
    const clips = t.tracks.filter(x => x.kind === "narration" || x.kind === "dialogue").flatMap(x => x.clips).sort((a, b) => a.start - b.start);
    for (let i = 1; i < clips.length; i++)
        if (ms(clips[i - 1].start + clips[i - 1].duration) > clips[i].start)
            throw new Error("Narration and dialogue clips cannot overlap.");
}
function changed(t) { normalize(t); noSpeechOverlap(t); return t; }
export function trimClip(timeline, trackId, clipId, start, duration) {
    validTime(start);
    validDuration(duration);
    const t = copy(timeline), { track, index } = clipIndex(t, trackId, clipId), old = track.clips[index];
    const sourceOffset = ms(old.sourceOffset + start - old.start);
    if (sourceOffset < 0)
        throw new Error("Trim would move before the source media.");
    track.clips[index] = { ...old, start, duration, sourceOffset };
    return changed(t);
}
export function splitClip(timeline, trackId, clipId, at, rightId) {
    const t = copy(timeline), { track, index } = clipIndex(t, trackId, clipId), c = track.clips[index];
    if (!rightId || t.tracks.some(x => x.clips.some(y => y.id === rightId)))
        throw new Error("Split clip ID must be unique.");
    if (!(at > c.start && at < c.start + c.duration))
        throw new Error("Split point must be inside the clip.");
    const left = { ...c, duration: at - c.start }, right = { ...c, id: rightId, start: at, duration: c.start + c.duration - at, sourceOffset: c.sourceOffset + at - c.start };
    track.clips.splice(index, 1, left, right);
    return changed(t);
}
export function moveClip(timeline, trackId, clipId, start) {
    validTime(start);
    const t = copy(timeline), { track, index } = clipIndex(t, trackId, clipId);
    track.clips[index] = { ...track.clips[index], start };
    return changed(t);
}
/** Move speech between narration/dialogue tracks without mutating the original timeline. */
export function moveClipToTrack(timeline, fromTrackId, toTrackId, clipId, start) {
    validTime(start);
    const t = copy(timeline), from = t.tracks.find(x => x.id === fromTrackId), to = t.tracks.find(x => x.id === toTrackId);
    if (!from || !to)
        throw new Error("Timeline track not found.");
    if (!["narration", "dialogue"].includes(from.kind) || !["narration", "dialogue"].includes(to.kind))
        throw new Error("Only speech clips can move between narration and dialogue tracks.");
    const index = from.clips.findIndex(x => x.id === clipId);
    if (index < 0)
        throw new Error("Timeline clip not found.");
    const [clip] = from.clips.splice(index, 1);
    to.clips.push({ ...clip, start });
    return changed(t);
}
export function duplicateClip(timeline, trackId, clipId, newId, start) {
    const t = copy(timeline), { track, index } = clipIndex(t, trackId, clipId), original = track.clips[index];
    if (!newId || t.tracks.some(x => x.clips.some(y => y.id === newId)))
        throw new Error("Duplicate clip ID must be unique.");
    const clone = { ...original, id: newId, start: start ?? original.start + original.duration };
    validTime(clone.start);
    track.clips.push(clone);
    return changed(t);
}
export function deleteClip(timeline, trackId, clipId) { const t = copy(timeline), { track, index } = clipIndex(t, trackId, clipId); track.clips.splice(index, 1); return changed(t); }
export function adjustClipDuration(timeline, trackId, clipId, duration) { const t = copy(timeline), { track, index } = clipIndex(t, trackId, clipId); validDuration(duration); track.clips[index] = { ...track.clips[index], duration }; return changed(t); }
export function replaceClipAsset(timeline, trackId, clipId, sourceRef) { if (typeof sourceRef !== "string" || !sourceRef.trim())
    throw new Error("Asset reference is required."); const t = copy(timeline), { track, index } = clipIndex(t, trackId, clipId); track.clips[index] = { ...track.clips[index], sourceRef }; return changed(t); }
export function setClipInstructions(timeline, trackId, clipId, instructions) {
    if (!instructions || typeof instructions !== "object" || (instructions.motion !== undefined && !isMotion(instructions.motion)) || (instructions.transitionIn !== undefined && !isTransition(instructions.transitionIn)) ||
        (instructions.transitionDuration !== undefined && (!Number.isFinite(instructions.transitionDuration) || instructions.transitionDuration < 0 || instructions.transitionDuration > 5)) ||
        (instructions.motionIntensity !== undefined && (!Number.isFinite(instructions.motionIntensity) || instructions.motionIntensity < 0 || instructions.motionIntensity > 1)) ||
        (instructions.motionDuration !== undefined && (!Number.isFinite(instructions.motionDuration) || instructions.motionDuration < .1 || instructions.motionDuration > 120)) ||
        (instructions.cameraStart !== undefined && !validCameraPoint(instructions.cameraStart)) || (instructions.cameraEnd !== undefined && !validCameraPoint(instructions.cameraEnd)))
        throw new Error("Invalid timeline instruction.");
    const t = copy(timeline), { track, index } = clipIndex(t, trackId, clipId);
    if (track.kind !== "image" && (instructions.motion !== undefined || instructions.motionIntensity !== undefined || instructions.motionDuration !== undefined || instructions.cameraStart !== undefined || instructions.cameraEnd !== undefined))
        throw new Error("Camera motion instructions require an image track.");
    track.clips[index] = { ...track.clips[index], ...instructions };
    return changed(t);
}
function isMotion(value) { return ["none", "zoom-in", "zoom-out", "pan-left", "pan-right", "pan-up", "pan-down"].includes(String(value)); }
function isTransition(value) { return ["cut", "crossfade", "fade-black", "wipe", "slide", "zoom"].includes(String(value)); }
function validCameraPoint(value) { if (!value || typeof value !== "object")
    return false; const p = value; return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.scale) && Number(p.x) >= 0 && Number(p.x) <= 1 && Number(p.y) >= 0 && Number(p.y) <= 1 && Number(p.scale) >= .1 && Number(p.scale) <= 10; }
/** Applies a stable alternating camera pattern to image clips only; rerunning produces the same instructions and clears render approval. */
/** Assign a deterministic transition to consecutive image clips only. */
export function assignAutomaticTransitions(timeline, style = "crossfade", duration = 0.5) {
    if (!isTransition(style) || !Number.isFinite(duration) || duration < 0 || duration > 5)
        throw new Error("Invalid automatic transition settings.");
    const t = copy(timeline), images = t.tracks.filter(track => track.kind === "image").flatMap(track => track.clips).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    images.forEach((clip, index) => { clip.transitionIn = index === 0 ? "cut" : style; clip.transitionDuration = index === 0 ? 0 : ms(duration); });
    return changed(t);
}
/** Remove reviewed, clip-relative silence ranges without changing source recordings. */
export function applySilenceRanges(timeline, trackId, clipId, inputRanges) {
    const t = copy(timeline), { track, index } = clipIndex(t, trackId, clipId);
    if (track.kind !== "narration" && track.kind !== "dialogue")
        throw new Error("Silence removal requires a speech clip.");
    const original = track.clips[index], ranges = inputRanges.map(r => ({ start: Math.max(0, Number(r.start)), end: Math.min(original.duration, Number(r.end)) })).filter(r => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start).sort((a, b) => a.start - b.start);
    if (!ranges.length)
        throw new Error("No valid silence ranges were selected.");
    const merged = [];
    for (const range of ranges) {
        const last = merged.at(-1);
        if (last && range.start <= last.end)
            last.end = Math.max(last.end, range.end);
        else
            merged.push(range);
    }
    let cursor = 0, removed = 0, partIndex = 0;
    const parts = [];
    const occupied = new Set(t.tracks.flatMap(x => x.clips.map(c => c.id)));
    const keep = (end) => { const duration = Math.round((end - cursor) * 1000) / 1000; if (duration > .001) {
        let id = partIndex++ === 0 ? original.id : `${original.id}-cut-${partIndex}`;
        while (id !== original.id && occupied.has(id))
            id += `-${partIndex}`;
        occupied.add(id);
        parts.push({ ...original, id, start: Math.max(0, Math.round((original.start + cursor - removed) * 1000) / 1000), duration, sourceOffset: Math.round((original.sourceOffset + cursor) * 1000) / 1000 });
    } };
    for (const range of merged) {
        const start = Math.min(original.duration, range.start), end = Math.min(original.duration, range.end);
        if (start > cursor)
            keep(start);
        removed += Math.max(0, end - Math.max(cursor, start));
        cursor = Math.max(cursor, end);
    }
    if (cursor < original.duration)
        keep(original.duration);
    if (!parts.length)
        throw new Error("Silence selection would remove the entire speech clip.");
    const oldEnd = original.start + original.duration;
    track.clips.splice(index, 1, ...parts);
    const voiceId = original.sourceRef.startsWith("voice:") ? original.sourceRef.slice(6) : "";
    for (const other of t.tracks) {
        const caption = voiceId && other.kind === "caption" ? other.clips.find(c => c.sourceRef === `caption:${voiceId}`) : undefined;
        if (caption)
            caption.duration = Math.max(.001, Math.round((original.duration - removed) * 1000) / 1000);
        other.clips = other.clips.map(c => c !== caption && c.start >= oldEnd ? { ...c, start: Math.max(0, Math.round((c.start - removed) * 1000) / 1000) } : c);
    }
    return changed(t);
}
export function assignAutomaticCameraMotion(timeline) {
    const t = copy(timeline), images = t.tracks.filter(track => track.kind === "image").flatMap(track => track.clips).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    const pattern = [
        { motion: "zoom-in", from: { x: .5, y: .5, scale: 1 }, to: { x: .5, y: .5, scale: 1.18 } },
        { motion: "pan-right", from: { x: .42, y: .5, scale: 1.12 }, to: { x: .58, y: .5, scale: 1.12 } },
        { motion: "zoom-out", from: { x: .5, y: .5, scale: 1.18 }, to: { x: .5, y: .5, scale: 1 } },
        { motion: "pan-left", from: { x: .58, y: .5, scale: 1.12 }, to: { x: .42, y: .5, scale: 1.12 } },
    ];
    images.forEach((clip, index) => { const p = pattern[index % pattern.length]; clip.motion = p.motion; clip.motionIntensity = .35; clip.motionDuration = ms(Math.max(.1, Math.min(clip.duration, 120))); clip.cameraStart = { ...p.from }; clip.cameraEnd = { ...p.to }; });
    return changed(t);
}
function ms(n) { return Math.round(n * 1000) / 1000; }
function validTime(n) { if (!Number.isFinite(n) || n < 0 || n > MAX_TIME)
    throw new Error("Timeline time is out of range."); }
function validDuration(n) { if (!Number.isFinite(n) || n <= 0 || n > MAX_TIME)
    throw new Error("Clip duration is out of range."); }
/** History stores serializable values; callers keep returned stacks in application state. */
export function pushTimelineUndo(undo, current) { return [...undo, copy(current)].slice(-100); }
export function undoTimeline(undo, current, redo) { if (!undo.length)
    return { timeline: current, undo, redo }; return { timeline: copy(undo.at(-1)), undo: undo.slice(0, -1), redo: [...redo, copy(current)].slice(-100) }; }
export function redoTimeline(undo, current, redo) { if (!redo.length)
    return { timeline: current, undo, redo }; return { timeline: copy(redo.at(-1)), undo: [...undo, copy(current)].slice(-100), redo: redo.slice(0, -1) }; }
export function estimateTimelineDuration(t) { return ms(Math.max(0, ...t.tracks.flatMap(x => x.clips.map(c => c.start + c.duration)))); }
export function synchronizeAudioDuration(timeline, duration) { validTime(duration); const t = copy(timeline); t.actualAudioDuration = ms(duration); t.estimatedDuration = ms(Math.max(estimateTimelineDuration(t), duration)); return t; }
export function prepareRenderManifest(t) { return { version: t.version, timeUnit: t.timeUnit, duration: estimateTimelineDuration(t), tracks: t.tracks.map(track => ({ id: track.id, kind: track.kind, clips: track.clips.map(c => ({ ...c })) })) }; }
/** Readiness requires approved source images and completed, approved, measured audio for every scene. */
export function canCreateTimeline(input) {
    return input.scriptApproved === true && Array.isArray(input.scenes) && input.scenes.length > 0 && input.scenes.every(s => s.approved === true && typeof s.image === "string" && !!s.image && Number.isFinite(s.seconds) && s.seconds > 0 && Array.isArray(s.voiceSegments) && s.voiceSegments.length > 0 && s.voiceSegments.every(v => v.approved === true && v.status === "completed" && !v.needsGeneration && Number.isFinite(v.durationSeconds) && v.durationSeconds > 0 && !!(v.dataUrl || v.versions?.some(x => typeof x.dataUrl === "string" && !!x.dataUrl))));
}
/** Build one chronological picture/caption beat per scene and sequential voice clips. Captions remain estimated until word timings exist. */
export function buildTimelineFromProject(input) {
    if (!canCreateTimeline(input))
        throw new Error("Approve the script, every scene image, and every completed audio segment before creating a timeline.");
    const t = createTimeline(), image = t.tracks.find(x => x.kind === "image"), narration = t.tracks.find(x => x.kind === "narration"), dialogue = t.tracks.find(x => x.kind === "dialogue"), captions = t.tracks.find(x => x.kind === "caption");
    let sceneStart = 0;
    for (const scene of input.scenes) {
        const audioDuration = ms(scene.voiceSegments.reduce((sum, line) => sum + line.durationSeconds, 0));
        const imageDuration = ms(Math.max(scene.seconds, audioDuration));
        validDuration(imageDuration);
        image.clips.push(newClip(`image-${scene.id}`, `image:${scene.id}`, sceneStart, imageDuration));
        let speechStart = sceneStart;
        for (const v of scene.voiceSegments) {
            const duration = ms(v.durationSeconds), track = v.role === "dialogue" ? dialogue : narration, source = `voice:${v.id}`;
            if (!source)
                throw new Error("Completed voice segment has no audio source.");
            track.clips.push({ ...newClip(`voice-${v.id}`, source, speechStart, duration), text: v.text, timing: "estimated" });
            captions.clips.push({ ...newClip(`caption-${v.id}`, `caption:${v.id}`, speechStart, duration), text: v.text, timing: "estimated" });
            speechStart = ms(speechStart + duration);
        }
        sceneStart = ms(sceneStart + imageDuration);
    }
    return changed(t);
}
function newClip(id, sourceRef, start, duration) { return { id, sourceRef, start: ms(start), duration: ms(duration), sourceOffset: 0, timing: "estimated", motion: "none", transitionIn: "cut" }; }
/** RMS window analysis over normalized PCM. Results are suggestions only. */
export function suggestSilenceRanges(pcm, sampleRate, options) {
    const { sensitivity, minSilenceSeconds, paddingSeconds } = options;
    if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000 || !Number.isFinite(sensitivity) || sensitivity < 0.001 || sensitivity > 0.5 || !Number.isFinite(minSilenceSeconds) || minSilenceSeconds < 0.1 || minSilenceSeconds > 30 || !Number.isFinite(paddingSeconds) || paddingSeconds < 0 || paddingSeconds > 2)
        throw new Error("Silence analysis settings are out of range.");
    const window = Math.max(1, Math.round(sampleRate * 0.02)), ranges = [];
    let began = -1;
    for (let i = 0; i < pcm.length; i += window) {
        let sum = 0, n = Math.min(window, pcm.length - i);
        for (let j = 0; j < n; j++) {
            const v = pcm[i + j];
            if (!Number.isFinite(v) || Math.abs(v) > 1)
                throw new Error("PCM samples must be finite normalized values.");
            sum += v * v;
        }
        const silent = Math.sqrt(sum / n) < sensitivity;
        if (silent && began < 0)
            began = i;
        if (!silent && began >= 0) {
            if ((i - began) / sampleRate >= minSilenceSeconds)
                ranges.push({ start: Math.max(0, began / sampleRate - paddingSeconds), end: Math.min(pcm.length / sampleRate, i / sampleRate + paddingSeconds) });
            began = -1;
        }
    }
    if (began >= 0 && (pcm.length - began) / sampleRate >= minSilenceSeconds)
        ranges.push({ start: Math.max(0, began / sampleRate - paddingSeconds), end: pcm.length / sampleRate });
    return ranges;
}
