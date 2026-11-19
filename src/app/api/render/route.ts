import { NextResponse } from "next/server";
import { cancelRenderJob, createRenderJob, getRenderJob } from "@/lib/ffmpeg-renderer";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const MAX_BODY=2*1024*1024;
async function readBoundedBody(request:Request){
  const declared=Number(request.headers.get("content-length")||0);if(declared>MAX_BODY)throw new Error("BODY_TOO_LARGE");
  if(!request.body)return "";const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BODY){await reader.cancel();throw new Error("BODY_TOO_LARGE");}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return new TextDecoder().decode(bytes);
}
export async function POST(request:Request){try{const body=JSON.parse(await readBoundedBody(request)) as Record<string,unknown>;if(typeof body.projectId!=="string")return NextResponse.json({error:"Project ID is required."},{status:400});const job=createRenderJob({projectId:body.projectId,manifest:body.manifest,format:body.format as "landscape"|"portrait",fps:body.fps as 30|60});return NextResponse.json({job},{status:202,headers:{"cache-control":"no-store"}});}catch(e){const message=e instanceof Error?e.message:"Unable to start render.";const status=message==="BODY_TOO_LARGE"?413:message==="Project not found."?404:message.includes("queue is full")?429:400;return NextResponse.json({error:message==="BODY_TOO_LARGE"?"Render request is too large.":message},{status,headers:{"cache-control":"no-store"}});}}
export async function GET(request:Request){const id=new URL(request.url).searchParams.get("id")||"";const job=getRenderJob(id);return job?NextResponse.json({job},{headers:{"cache-control":"no-store"}}):NextResponse.json({error:"Render job not found."},{status:404});}
export async function DELETE(request:Request){const id=new URL(request.url).searchParams.get("id")||"";const job=cancelRenderJob(id);return job?NextResponse.json({job},{headers:{"cache-control":"no-store"}}):NextResponse.json({error:"Active render job not found."},{status:404});}
