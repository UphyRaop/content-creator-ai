import { NextResponse } from "next/server";
import { cancelRenderJob, getRenderJob, retryRenderJobAsync } from "@/lib/ffmpeg-renderer";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export async function GET(_request:Request,{params}:Context){const {id}=await params;const job=getRenderJob(id);return job?NextResponse.json({job},{headers:{"cache-control":"no-store"}}):NextResponse.json({error:"Render job not found."},{status:404});}
export async function DELETE(_request:Request,{params}:Context){const {id}=await params;const job=cancelRenderJob(id);return job?NextResponse.json({job},{headers:{"cache-control":"no-store"}}):NextResponse.json({error:"Active render job not found."},{status:404});}
export async function POST(_request:Request,{params}:Context){try{const {id}=await params;const job=await retryRenderJobAsync(id);return job?NextResponse.json({job},{status:202,headers:{"cache-control":"no-store"}}):NextResponse.json({error:"Retryable render job not found."},{status:404});}catch(e){const message=e instanceof Error?e.message:"Unable to retry render.";return NextResponse.json({error:message},{status:message.includes("queue is full")?429:400});}}
