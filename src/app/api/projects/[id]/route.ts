import { NextResponse } from "next/server";
import { deleteOwnedProject, getOwnedProject, updateOwnedProject, validatePayload } from "@/lib/project-store";
import { getSessionUser, isSameOriginMutation, readBoundedRequestText } from "@/lib/auth";
import { getProjectApprovals } from "@/lib/approval-store";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const user=await getSessionUser(_request);if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  const { id } = await params;
  const project = getOwnedProject(user.id,id);
  return project ? NextResponse.json({ project:{...project,approvals:getProjectApprovals(user.id,id)} },{headers:{"cache-control":"no-store"}}) : NextResponse.json({ error: "Project not found." }, { status: 404 });
}

export async function PATCH(request: Request, { params }: Context) {
  const user=await getSessionUser(request);if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  if(!isSameOriginMutation(request))return NextResponse.json({error:"Same-origin request required."},{status:403});
  try {
    const { id } = await params;
    const raw = await readBoundedRequestText(request,40*1024*1024);
    const body = JSON.parse(raw) as { title?: unknown; payload?: unknown };
    if ((body.title !== undefined && typeof body.title !== "string") ||
      (body.payload !== undefined && !validatePayload(body.payload))) {
      return NextResponse.json({ error: "Invalid project data." }, { status: 400 });
    }
    const project = updateOwnedProject(user.id,id, { title: body.title as string | undefined, payload: body.payload as Record<string, unknown> | undefined });
    return project ? NextResponse.json({ project:{...project,approvals:getProjectApprovals(user.id,id)} },{headers:{"cache-control":"no-store"}}) : NextResponse.json({ error: "Project not found." }, { status: 404 });
  } catch (error) {
    const message=error instanceof Error?error.message:"Unable to update project.";return NextResponse.json({ error: message==="REQUEST_BODY_TOO_LARGE"?"Project data is too large. Reduce image reference sizes.":message }, { status: message==="REQUEST_BODY_TOO_LARGE"?413:400 });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const user=await getSessionUser(_request);if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  if(!isSameOriginMutation(_request))return NextResponse.json({error:"Same-origin request required."},{status:403});
  const { id } = await params;
  return deleteOwnedProject(user.id,id)
    ? NextResponse.json({ deleted: true })
    : NextResponse.json({ error: "Project not found." }, { status: 404 });
}
