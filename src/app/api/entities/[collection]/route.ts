import { NextResponse } from "next/server";
import { deleteEntity, listEntities, saveEntity } from "@/lib/entity-store";
import { getSessionUser, isSameOriginMutation, readBoundedRequestText } from "@/lib/auth";

export const runtime = "nodejs";
type Context = { params: Promise<{ collection: string }> };
export async function GET(request: Request, { params }: Context) {
  const user=await getSessionUser(request);if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  try { const { collection } = await params; return NextResponse.json({ records: listEntities(collection,user.id) },{headers:{"cache-control":"no-store"}}); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load records." }, { status: 400 }); }
}
export async function PUT(request: Request, { params }: Context) {
  const user=await getSessionUser(request);if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  if(!isSameOriginMutation(request))return NextResponse.json({error:"Same-origin request required."},{status:403});
  try {
    const { collection } = await params;
    const raw = await readBoundedRequestText(request,40*1024*1024);
    const body = JSON.parse(raw) as { record?: unknown };
    return NextResponse.json({ record: saveEntity(collection, body.record,user.id) });
  } catch (error) { const message=error instanceof Error?error.message:"Unable to save record.";return NextResponse.json({ error: message==="REQUEST_BODY_TOO_LARGE"?"Library data exceeds the 40 MB limit.":message }, { status: message==="REQUEST_BODY_TOO_LARGE"?413:400 }); }
}
export async function DELETE(request: Request, { params }: Context) {
  const user=await getSessionUser(request);if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  if(!isSameOriginMutation(request))return NextResponse.json({error:"Same-origin request required."},{status:403});
  try { const { collection } = await params; const id = new URL(request.url).searchParams.get("id") || ""; return deleteEntity(collection, id,user.id) ? NextResponse.json({ deleted: true }) : NextResponse.json({ error: "Record not found." }, { status: 404 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete record." }, { status: 400 }); }
}
