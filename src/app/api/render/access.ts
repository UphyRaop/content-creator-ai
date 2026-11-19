import { NextResponse } from "next/server";
import { getSessionUser, isSameOriginMutation } from "@/lib/auth";
import { getOwnedProject } from "@/lib/project-store";
import { getRenderJob } from "@/lib/ffmpeg-renderer";

export async function requireRenderUser(request: Request) {
  const user = await getSessionUser(request);
  return user ?? NextResponse.json({ error: "Authentication required." }, { status: 401, headers: { "cache-control": "no-store" } });
}

export function ownedRenderJob(ownerId: string, id: string) {
  const job = getRenderJob(id);
  if (!job) return null;
  const project = getOwnedProject(ownerId, job.projectId);
  return project ? { job, project } : null;
}

export { isSameOriginMutation as sameOriginMutation };

export function crossOriginResponse() {
  return NextResponse.json({ error: "Cross-origin mutation rejected." }, { status: 403, headers: { "cache-control": "no-store" } });
}

export function notFoundResponse() {
  return NextResponse.json({ error: "Render job not found." }, { status: 404, headers: { "cache-control": "no-store" } });
}
