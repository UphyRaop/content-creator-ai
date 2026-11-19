import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getRenderOutputFile, parseRenderByteRange } from "@/lib/ffmpeg-renderer";
import { hasProjectApproval } from "@/lib/approval-store";
import { notFoundResponse, ownedRenderJob, requireRenderUser } from "../../access";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};

async function streamResponse(request:Request,id:string,ownerId:string,headOnly=false){
  const access=ownedRenderJob(ownerId,id);if(!access)return notFoundResponse();const job=access.job;
  if(!hasProjectApproval(ownerId,access.project.id,"timeline"))return NextResponse.json({error:"The current timeline approval is stale."},{status:409,headers:{"cache-control":"no-store"}});
  if(job.status!=="completed")return NextResponse.json({error:"Render is not complete."},{status:409});
  const filename=getRenderOutputFile(id);if(!filename)return NextResponse.json({error:"Render output has expired."},{status:410});
  const size=(await stat(filename)).size,range=parseRenderByteRange(request.headers.get("range"),size);if(!range.valid)return new Response(null,{status:416,headers:{"content-range":`bytes */${size}`}});
  const {start,end}=range,status=range.partial?206:200;
  const headers={"content-type":"video/mp4","content-length":String(end-start+1),"accept-ranges":"bytes","cache-control":"private, no-store","content-disposition":`inline; filename="${job.projectId}-${job.id}.mp4"`,...(status===206?{"content-range":`bytes ${start}-${end}/${size}`}:{})};
  if(headOnly)return new Response(null,{status,headers});
  const stream=createReadStream(filename,{start,end});return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>,{status,headers});
}
export async function GET(request:Request,{params}:Context){const user=await requireRenderUser(request);if(user instanceof NextResponse)return user;const {id}=await params;return streamResponse(request,id,user.id);}
export async function HEAD(request:Request,{params}:Context){const user=await requireRenderUser(request);if(user instanceof NextResponse)return user;const {id}=await params;return streamResponse(request,id,user.id,true);}
