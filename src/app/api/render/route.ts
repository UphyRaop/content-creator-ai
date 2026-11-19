import { NextResponse } from "next/server";
import { cancelRenderJob, createRenderJob, hashRenderManifest } from "@/lib/ffmpeg-renderer";
import { hasProjectApproval } from "@/lib/approval-store";
import { getOwnedProject } from "@/lib/project-store";
import { crossOriginResponse, notFoundResponse, ownedRenderJob, requireRenderUser, sameOriginMutation } from "./access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY = 2 * 1024 * 1024;

async function readBoundedBody(request: Request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY) throw new Error("BODY_TOO_LARGE");
  if (!request.body) return "";
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); throw new Error("BODY_TOO_LARGE"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export async function POST(request: Request) {
  const user = await requireRenderUser(request);
  if (user instanceof NextResponse) return user;
  if (!sameOriginMutation(request)) return crossOriginResponse();
  try {
    const body = JSON.parse(await readBoundedBody(request)) as Record<string, unknown>;
    if (typeof body.projectId !== "string" || !body.projectId) return NextResponse.json({ error: "Project ID is required." }, { status: 400 });
    const project = getOwnedProject(user.id, body.projectId);
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    if (!hasProjectApproval(user.id, project.id, "timeline")) return NextResponse.json({ error: "Approve the current timeline before rendering." }, { status: 409 });
    if (!body.manifest || typeof body.manifest !== "object") return NextResponse.json({ error: "Approved timeline manifest is required." }, { status: 400 });
    const submittedManifestHash = hashRenderManifest(body.manifest);
    const timeline = project.payload.timeline && typeof project.payload.timeline === "object" ? project.payload.timeline as Record<string, unknown> : {};
    const renderApproval = timeline.renderApproval && typeof timeline.renderApproval === "object" ? timeline.renderApproval as Record<string, unknown> : {};
    if (typeof renderApproval.manifestHash !== "string" || renderApproval.manifestHash.toLowerCase() !== submittedManifestHash.toLowerCase()) return NextResponse.json({ error: "Submitted render manifest does not match the server-approved timeline." }, { status: 409 });
    const settings = project.payload.settings && typeof project.payload.settings === "object" ? project.payload.settings as Record<string, unknown> : {};
    const format = settings.aspectRatio === "9:16" ? "portrait" : settings.aspectRatio === "16:9" ? "landscape" : null;
    if (!format) return NextResponse.json({ error: "Saved project aspect ratio is invalid." }, { status: 400 });
    const fps = project.payload.renderFps === 60 ? 60 : 30;
    const job = createRenderJob({ projectId: project.id, manifest: body.manifest, format, fps });
    return NextResponse.json({ job }, { status: 202, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start render.";
    const status = message === "BODY_TOO_LARGE" ? 413 : message === "Project not found." ? 404 : message.includes("queue is full") ? 429 : 400;
    return NextResponse.json({ error: message === "BODY_TOO_LARGE" ? "Render request is too large." : message }, { status, headers: { "cache-control": "no-store" } });
  }
}

export async function GET(request: Request) {
  const user = await requireRenderUser(request);
  if (user instanceof NextResponse) return user;
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Render job ID is required." }, { status: 400, headers: { "cache-control": "no-store" } });
  const access = ownedRenderJob(user.id, id);
  return access ? NextResponse.json({ job: access.job }, { headers: { "cache-control": "no-store" } }) : notFoundResponse();
}

export async function DELETE(request: Request) {
  const user = await requireRenderUser(request);
  if (user instanceof NextResponse) return user;
  if (!sameOriginMutation(request)) return crossOriginResponse();
  const id = new URL(request.url).searchParams.get("id") || "";
  const access = id ? ownedRenderJob(user.id, id) : null;
  if (!access) return notFoundResponse();
  if (!hasProjectApproval(user.id, access.project.id, "timeline")) return NextResponse.json({ error: "The current timeline approval is stale." }, { status: 409, headers: { "cache-control": "no-store" } });
  const job = cancelRenderJob(id);
  return job ? NextResponse.json({ job }, { headers: { "cache-control": "no-store" } }) : NextResponse.json({ error: "Active render job not found." }, { status: 404, headers: { "cache-control": "no-store" } });
}
