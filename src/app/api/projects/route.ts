import { NextResponse } from "next/server";
import { createProject, listProjects, validatePayload } from "@/lib/project-store";
import { getSessionUser, isSameOriginMutation, readBoundedRequestText } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request:Request) {
  const user=await getSessionUser(request);if(!user)return NextResponse.json({error:"Authentication required."},{status:401,headers:{"cache-control":"no-store"}});
  return NextResponse.json({ projects: listProjects(user.id) },{headers:{"cache-control":"no-store"}});
}

export async function POST(request: Request) {
  const user=await getSessionUser(request);if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  if(!isSameOriginMutation(request))return NextResponse.json({error:"Same-origin request required."},{status:403});
  try {
    const raw = await readBoundedRequestText(request,40*1024*1024);
    const body = JSON.parse(raw) as { title?: unknown; payload?: unknown };
    const payload = body.payload ?? {};
    if (typeof body.title !== "string" || !validatePayload(payload)) {
      return NextResponse.json({ error: "Invalid project data." }, { status: 400 });
    }
    return NextResponse.json({ project: createProject(body.title, payload,user.id) }, { status: 201,headers:{"cache-control":"no-store"} });
  } catch (error) {
    const message=error instanceof Error?error.message:"Unable to create project.";return NextResponse.json({ error: message==="REQUEST_BODY_TOO_LARGE"?"Project data is too large. Reduce image reference sizes.":message }, { status: message==="REQUEST_BODY_TOO_LARGE"?413:400 });
  }
}
