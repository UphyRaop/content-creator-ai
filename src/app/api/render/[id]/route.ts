import { NextResponse } from "next/server";
import { cancelRenderJob, retryRenderJobAsync } from "@/lib/ffmpeg-renderer";
import { hasProjectApproval } from "@/lib/approval-store";
import { crossOriginResponse, notFoundResponse, ownedRenderJob, requireRenderUser, sameOriginMutation } from "../access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const user = await requireRenderUser(request);
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  const access = ownedRenderJob(user.id, id);
  return access ? NextResponse.json({ job: access.job }, { headers: { "cache-control": "no-store" } }) : notFoundResponse();
}

export async function DELETE(request: Request, { params }: Context) {
  const user = await requireRenderUser(request);
  if (user instanceof NextResponse) return user;
  if (!sameOriginMutation(request)) return crossOriginResponse();
  const { id } = await params;
  const access = ownedRenderJob(user.id, id);
  if (!access) return notFoundResponse();
  if (!hasProjectApproval(user.id, access.project.id, "timeline")) return NextResponse.json({ error: "The current timeline approval is stale." }, { status: 409, headers: { "cache-control": "no-store" } });
  const job = cancelRenderJob(id);
  return job ? NextResponse.json({ job }, { headers: { "cache-control": "no-store" } }) : NextResponse.json({ error: "Active render job not found." }, { status: 404, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request, { params }: Context) {
  const user = await requireRenderUser(request);
  if (user instanceof NextResponse) return user;
  if (!sameOriginMutation(request)) return crossOriginResponse();
  const { id } = await params;
  const access = ownedRenderJob(user.id, id);
  if (!access) return notFoundResponse();
  if (!hasProjectApproval(user.id, access.project.id, "timeline")) return NextResponse.json({ error: "The current timeline approval is stale." }, { status: 409, headers: { "cache-control": "no-store" } });
  if (access.job.kind === "post-production" && access.job.parentRenderJobId && !ownedRenderJob(user.id, access.job.parentRenderJobId)) return notFoundResponse();
  try {
    const job = await retryRenderJobAsync(id);
    return job ? NextResponse.json({ job }, { status: 202, headers: { "cache-control": "no-store" } }) : NextResponse.json({ error: "Retryable render job not found." }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to retry render.";
    return NextResponse.json({ error: message }, { status: message.includes("queue is full") ? 429 : 400 });
  }
}
