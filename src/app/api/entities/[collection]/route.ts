import { NextResponse } from "next/server";
import { deleteEntity, listEntities, saveEntity } from "@/lib/entity-store";

export const runtime = "nodejs";
type Context = { params: Promise<{ collection: string }> };
export async function GET(_request: Request, { params }: Context) {
  try { const { collection } = await params; return NextResponse.json({ records: listEntities(collection) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load records." }, { status: 400 }); }
}
export async function PUT(request: Request, { params }: Context) {
  try {
    const { collection } = await params;
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 40 * 1024 * 1024) return NextResponse.json({ error: "Library data exceeds the 40 MB limit." }, { status: 413 });
    const body = JSON.parse(raw) as { record?: unknown };
    return NextResponse.json({ record: saveEntity(collection, body.record) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save record." }, { status: 400 }); }
}
export async function DELETE(request: Request, { params }: Context) {
  try { const { collection } = await params; const id = new URL(request.url).searchParams.get("id") || ""; return deleteEntity(collection, id) ? NextResponse.json({ deleted: true }) : NextResponse.json({ error: "Record not found." }, { status: 404 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete record." }, { status: 400 }); }
}
