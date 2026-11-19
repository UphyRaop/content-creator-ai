import type { ScriptRequest } from "./script-workflow.ts";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}

/** Builds script input only from a saved, approved creative brief and project settings. */
export function scriptRequestFromSavedProject(payload: unknown): ScriptRequest {
  const project = record(payload);
  const settings = record(project?.settings);
  const brief = record(project?.brief);
  if (!project || typeof project.idea !== "string" || !project.idea.trim()) throw new Error("The saved project is missing its idea.");
  if (!brief || brief.approved !== true) throw new Error("Approve the saved creative brief before generating a script.");
  if (!settings) throw new Error("The saved project is missing its generation settings.");
  const format = project.scriptFormat;
  if (!Number.isInteger(settings.durationMinutes) || typeof settings.language !== "string" || !settings.language.trim() || typeof settings.visualStyle !== "string" || !settings.visualStyle.trim()) {
    throw new Error("The saved project is missing valid duration, language, or visual style settings.");
  }
  if (format !== "narration" && format !== "dialogue" && format !== "mixed") throw new Error("The saved project is missing a valid script format.");
  if ([brief.title, brief.direction, brief.goal].some(value => typeof value !== "string" || !value.trim())) throw new Error("The saved approved brief is incomplete.");
  const images = Array.isArray(settings.referenceImages) ? settings.referenceImages : [];
  const videos = Array.isArray(settings.referenceVideos) ? settings.referenceVideos : [];
  const referenceText = typeof project.referenceText === "string" ? project.referenceText : undefined;
  const referenceNotes = typeof project.reference === "string" ? project.reference : undefined;
  const request: ScriptRequest = {
    idea: project.idea,
    ...(referenceNotes ? { referenceNotes } : {}),
    ...(referenceText ? { referenceText } : {}),
    referenceImages: images.map((raw) => {
      const image = record(raw);
      if (!image) return {};
      return {
        ...(typeof image.name === "string" ? { name: image.name } : {}),
        ...(typeof image.category === "string" ? { category: image.category } : {}),
        ...(typeof image.mimeType === "string" ? { mimeType: image.mimeType } : {}),
        ...(typeof image.dataUrl === "string" ? { dataUrl: image.dataUrl } : {}),
      };
    }),
    referenceVideos: videos.filter((url): url is string => typeof url === "string"),
    durationMinutes: Number(settings.durationMinutes),
    language: String(settings.language ?? ""),
    visualStyle: String(settings.visualStyle ?? ""),
    format,
    brief: {
      title: typeof brief.title === "string" ? brief.title : "",
      direction: typeof brief.direction === "string" ? brief.direction : "",
      goal: typeof brief.goal === "string" ? brief.goal : "",
      approved: true,
    },
  };
  return request;
}

/** Derives eligible image inputs from saved approved script/scenes. Client values are IDs only. */
export function imageRequestFromSavedProject(payload: unknown, requestedSceneIds: unknown) {
  const project = record(payload);
  const settings = record(project?.settings);
  const brief = record(project?.brief);
  if (!project) throw new Error("Saved project data is missing.");
  if (!brief || brief.approved !== true || project.scriptApproved !== true || typeof project.script !== "string" || !project.script.trim()) {
    throw new Error("Approve the saved creative brief and script before generating scene images.");
  }
  if (!settings || !["9:16", "16:9"].includes(String(settings.aspectRatio))) throw new Error("The saved project has no valid image aspect ratio.");
  if (!Array.isArray(requestedSceneIds) || requestedSceneIds.length < 1 || requestedSceneIds.length > 100 || requestedSceneIds.some(id => typeof id !== "string" || !id.trim())) {
    throw new Error("Select one or more saved scenes to generate.");
  }
  const ids = requestedSceneIds as string[];
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate scene IDs are not allowed.");
  if (!Array.isArray(project.scenes) || project.scenes.length === 0) throw new Error("The saved project has no scene breakdown.");
  const scenesById = new Map(project.scenes.map(record).filter((scene): scene is RecordValue => !!scene && typeof scene.id === "string").map(scene => [scene.id as string, scene]));
  const scenes = ids.map(id => {
    const scene = scenesById.get(id);
    if (!scene) throw new Error("A requested scene does not belong to the saved project.");
    if (scene.approved === true || scene.approvalStatus === "approved") throw new Error("Approved scene images cannot be regenerated through this request.");
    if (!["pending", "rejected"].includes(String(scene.approvalStatus))) throw new Error("Only pending or rejected scenes can be generated.");
    return {
      id,
      prompt: typeof scene.prompt === "string" ? scene.prompt : "",
      scriptText: typeof scene.line === "string" ? scene.line : "",
      approvalStatus: scene.approvalStatus as "pending" | "rejected",
    };
  });
  return {
    scriptApproved: true as const,
    aspectRatio: settings.aspectRatio as "9:16" | "16:9",
    spendingLimitMyr: typeof project.imageSpendingLimitMyr === "number" ? project.imageSpendingLimitMyr : 0,
    scenes,
  };
}
