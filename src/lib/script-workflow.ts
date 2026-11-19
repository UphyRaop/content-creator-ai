export type ScriptFormat = "narration" | "dialogue" | "mixed";
export type ScriptRequest = { idea: string; referenceNotes?: string; referenceText?: string; referenceImages?: Array<{ name?: string; category?: string; mimeType?: string; dataUrl?: string }>; referenceVideos?: string[]; durationMinutes: number; language: string; visualStyle: string; format: ScriptFormat; brief: { title: string; direction: string; goal: string; approved: boolean } };
export type ScriptDraft = { text: string; wordCount: number; estimatedSeconds: number; format: ScriptFormat };
export function validateScriptRequest(value: unknown): value is ScriptRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const r = value as Partial<ScriptRequest>;
  const validImages = r.referenceImages === undefined || (
    Array.isArray(r.referenceImages) && r.referenceImages.length <= 12 && r.referenceImages.every(image => {
      if (!image || typeof image !== "object") return false;
      if (image.dataUrl === undefined) return true;
      return typeof image.dataUrl === "string" && /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/]+=*$/i.test(image.dataUrl) && image.dataUrl.length <= 2_800_000;
    })
  );
  return typeof r.idea === "string" && !!r.idea.trim() && r.idea.length <= 4000 &&
    typeof r.durationMinutes === "number" && Number.isInteger(r.durationMinutes) && r.durationMinutes >= 1 && r.durationMinutes <= 5 &&
    typeof r.language === "string" && r.language.length <= 60 && typeof r.visualStyle === "string" && r.visualStyle.length <= 100 &&
    ["narration", "dialogue", "mixed"].includes(String(r.format)) && !!r.brief && r.brief.approved === true &&
    typeof r.brief.title === "string" && typeof r.brief.direction === "string" && typeof r.brief.goal === "string" &&
    [r.referenceNotes, r.referenceText].every(value => value === undefined || (typeof value === "string" && value.length <= 20_000)) &&
    (r.referenceVideos === undefined || (Array.isArray(r.referenceVideos) && r.referenceVideos.length <= 20 && r.referenceVideos.every(url => typeof url === "string" && isHttpsUrl(url)))) && validImages;
}
export function isHttpsUrl(value: string) { try { return new URL(value).protocol === "https:"; } catch { return false; } }
export function wordCount(text: string) { return text.trim() ? text.trim().split(/\s+/u).length : 0; }
export function estimatedDurationSeconds(text: string, wordsPerMinute = 140) { return Math.round(wordCount(text) / wordsPerMinute * 60); }
export function estimateCostMyr(inputTokens: number, outputTokens: number, inputRate?: number, outputRate?: number) { return inputRate === undefined || outputRate === undefined ? null : (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000; }
export function createSimulatedScript(request: ScriptRequest): ScriptDraft {
  const duration = request.durationMinutes * 60, title = request.brief.title.trim() || request.idea.trim(), topic = request.idea.trim();
  const context = [request.referenceNotes, request.referenceText].filter(Boolean).join(" ").trim();
  const narrator = request.format === "dialogue" ? "[HOST]" : "[NARRATOR]";
  const lines = [
    `[OPEN — 0:00]\n${narrator} ${title}. Today, we explore ${topic}.${context ? ` Keep this reference context in mind: ${context}.` : ""}`,
    `[SETUP — 0:${Math.round(duration * .15)}]\n[NARRATOR] Begin with a clear question. What makes this story worth sharing, and why does it matter now?`,
    `[STORY — 0:${Math.round(duration * .35)}]\n${request.format === "dialogue" ? "[HOST]" : "[NARRATOR]"} Start with details people can recognize. Show the setting, introduce the people, and make the central idea easy to understand. Let each moment lead naturally into the next.`,
    `[DEVELOPMENT — 0:${Math.round(duration * .58)}]\n${request.format === "dialogue" ? "[GUEST]" : "[NARRATOR]"} A useful change often begins with one thoughtful step. Explain the challenge, show a practical response, and include a specific example that gives the audience a reason to care.`,
    `[TURNING POINT — 0:${Math.round(duration * .78)}]\n${request.format === "mixed" ? "[HOST]" : narrator} Here is the key insight: small choices can create a meaningful difference when they are grounded in a clear purpose.`,
    `[TAKEAWAY — 0:${Math.round(duration * .91)}]\n${narrator} The main takeaway is simple. Understand the need, make the next step clear, and keep the human story at the center.`,
    `[CLOSE — ${duration}]\n${narrator} What will you create next? Thanks for watching.`
  ];
  const text = lines.join("\n\n");
  return { text, wordCount: wordCount(text), estimatedSeconds: estimatedDurationSeconds(text), format: request.format };
}
export type ScriptVersion = { id: string; text: string; createdAt: string; reason: "generated" | "edited" | "restored" };
export function appendScriptVersion(versions: ScriptVersion[], text: string, reason: ScriptVersion["reason"]): ScriptVersion[] { const clean=text.trim(); if(!clean || versions.at(-1)?.text===clean)return versions; return [...versions,{id:`v${versions.length+1}-${Date.now().toString(36)}`,text:clean,createdAt:new Date().toISOString(),reason}].slice(-50); }
