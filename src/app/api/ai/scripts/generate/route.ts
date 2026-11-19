import { NextResponse } from "next/server";
import { getScriptProvider } from "@/lib/ai-provider";
import { getProject } from "@/lib/project-store";
import { scriptRequestFromSavedProject } from "@/lib/ai-generation-gates";
import { validateScriptRequest } from "@/lib/script-workflow";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 16 * 1024) return NextResponse.json({ error: "Script request is too large." }, { status: 413 });
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body) || typeof (body as Record<string, unknown>).projectId !== "string" || !(body as Record<string, unknown>).projectId) {
      return NextResponse.json({ error: "A saved project ID is required." }, { status: 400 });
    }
    const project = getProject((body as { projectId: string }).projectId);
    if (!project) return NextResponse.json({ error: "Saved project not found." }, { status: 404 });
    const savedRequest = scriptRequestFromSavedProject(project.payload);
    if (!validateScriptRequest(savedRequest)) return NextResponse.json({ error: "Saved project inputs are incomplete or invalid." }, { status: 400 });
    return NextResponse.json(await getScriptProvider().generate(savedRequest));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Script generation failed. Please try again.";
    const status = message.includes("Approve the saved") ? 409
      : message.includes("exceeds the configured maximum") ? 402
      : message.includes("disabled") || message.includes("not configured") || message.includes("blocked") ? 503
      : message.includes("Gemini request failed") || message.includes("Gemini returned") ? 502
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
