import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getRenderJob, getRenderOutputFile } from "@/lib/ffmpeg-renderer";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export async function GET(_request:Request,{params}:Context){
  const {id}=await params,job=getRenderJob(id);
  if(!job)return NextResponse.json({error:"Render job not found."},{status:404});
  if(job.status!=="completed")return NextResponse.json({error:"Render is not complete."},{status:409});
  const filename=getRenderOutputFile(id);if(!filename)return NextResponse.json({error:"Render output has expired."},{status:410});
  let size:number;try{size=(await stat(filename)).size;}catch{return NextResponse.json({error:"Render output has expired."},{status:410});}
  const stream=createReadStream(filename);
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>,{headers:{"content-type":"video/mp4","content-disposition":`attachment; filename="${job.projectId}-${job.id}.mp4"`,"content-length":String(size),"cache-control":"no-store"}});
}
