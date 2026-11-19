import { NextResponse } from "next/server";
import { deleteProject, getProject, updateProject, validatePayload } from "@/lib/project-store";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  const project = getProject(id);
  return project ? NextResponse.json({ project }) : NextResponse.json({ error: "Project not found." }, { status: 404 });
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 40 * 1024 * 1024) {
      return NextResponse.json({ error: "Project data is too large. Reduce image reference sizes." }, { status: 413 });
    }
    const body = JSON.parse(raw) as { title?: unknown; payload?: unknown };
    if ((body.title !== undefined && typeof body.title !== "string") ||
      (body.payload !== undefined && !validatePayload(body.payload))) {
      return NextResponse.json({ error: "Invalid project data." }, { status: 400 });
    }
    const project = updateProject(id, { title: body.title as string | undefined, payload: body.payload as Record<string, unknown> | undefined });
    return project ? NextResponse.json({ project }) : NextResponse.json({ error: "Project not found." }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update project." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const { id } = await params;
  return deleteProject(id)
    ? NextResponse.json({ deleted: true })
    : NextResponse.json({ error: "Project not found." }, { status: 404 });
}
