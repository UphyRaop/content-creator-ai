import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getRenderJob, getRenderOutputFile, parseRenderByteRange } from "@/lib/ffmpeg-renderer";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};

async function streamResponse(request:Request,id:string,headOnly=false){
  const job=getRenderJob(id);if(!job)return NextResponse.json({error:"Render job not found."},{status:404});
  if(job.status!=="completed")return NextResponse.json({error:"Render is not complete."},{status:409});
  const filename=getRenderOutputFile(id);if(!filename)return NextResponse.json({error:"Render output has expired."},{status:410});
  const size=(await stat(filename)).size,range=parseRenderByteRange(request.headers.get("range"),size);if(!range.valid)return new Response(null,{status:416,headers:{"content-range":`bytes */${size}`}});
  const {start,end}=range,status=range.partial?206:200;
  const headers={"content-type":"video/mp4","content-length":String(end-start+1),"accept-ranges":"bytes","cache-control":"private, no-store","content-disposition":`inline; filename="${job.projectId}-${job.id}.mp4"`,...(status===206?{"content-range":`bytes ${start}-${end}/${size}`}:{})};
  if(headOnly)return new Response(null,{status,headers});
  const stream=createReadStream(filename,{start,end});return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>,{status,headers});
}
export async function GET(request:Request,{params}:Context){const {id}=await params;return streamResponse(request,id);}
export async function HEAD(request:Request,{params}:Context){const {id}=await params;return streamResponse(request,id,true);}
