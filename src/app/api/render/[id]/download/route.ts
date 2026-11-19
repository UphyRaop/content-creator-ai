import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getRenderOutputFile } from "@/lib/ffmpeg-renderer";
import { hasProjectApproval } from "@/lib/approval-store";
import { notFoundResponse, ownedRenderJob, requireRenderUser } from "../../access";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Context){
  const user=await requireRenderUser(request);if(user instanceof NextResponse)return user;
  const {id}=await params,access=ownedRenderJob(user.id,id);
  if(!access)return notFoundResponse();const job=access.job;
  if(!hasProjectApproval(user.id,access.project.id,"export"))return NextResponse.json({error:"Approve the current project export before downloading the video."},{status:409,headers:{"cache-control":"no-store"}});
  if(job.status!=="completed")return NextResponse.json({error:"Render is not complete."},{status:409});
  const filename=getRenderOutputFile(id);if(!filename)return NextResponse.json({error:"Render output has expired."},{status:410});
  let size:number;try{size=(await stat(filename)).size;}catch{return NextResponse.json({error:"Render output has expired."},{status:410});}
  const stream=createReadStream(filename);
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>,{headers:{"content-type":"video/mp4","content-disposition":`attachment; filename="${job.projectId}-${job.id}.mp4"`,"content-length":String(size),"cache-control":"no-store"}});
}
