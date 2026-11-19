import { NextResponse } from "next/server";
import { createProject, listProjects, validatePayload } from "@/lib/project-store";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ projects: listProjects() });
}

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 40 * 1024 * 1024) {
      return NextResponse.json({ error: "Project data is too large. Reduce image reference sizes." }, { status: 413 });
    }
    const body = JSON.parse(raw) as { title?: unknown; payload?: unknown };
    const payload = body.payload ?? {};
    if (typeof body.title !== "string" || !validatePayload(payload)) {
      return NextResponse.json({ error: "Invalid project data." }, { status: 400 });
    }
    return NextResponse.json({ project: createProject(body.title, payload) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create project." }, { status: 400 });
  }
}
