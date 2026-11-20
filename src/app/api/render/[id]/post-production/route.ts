import { NextResponse } from "next/server";
import { createPostProductionExportJob, type PostProductionAudioUpload } from "@/lib/ffmpeg-renderer";
import { hasProjectApproval } from "@/lib/approval-store";
import { crossOriginResponse, notFoundResponse, ownedRenderJob, requireRenderUser, sameOriginMutation } from "../../access";
import { cloudRenderAdmissionBlock } from "@/lib/provider-admission";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const MAX_BODY=32*1024*1024;
type Context={params:Promise<{id:string}>};

async function readBoundedBody(request:Request){
  const declared=Number(request.headers.get("content-length")||0);if(declared>MAX_BODY)throw new Error("BODY_TOO_LARGE");
  if(!request.body)return "";const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BODY){await reader.cancel();throw new Error("BODY_TOO_LARGE");}chunks.push(value);}}finally{reader.releaseLock();}
  const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}return new TextDecoder().decode(body);
}
/** Creates a non-destructive derived MP4 from an existing completed render-job ID. */
export async function POST(request:Request,{params}:Context){
  const user=await requireRenderUser(request);if(user instanceof NextResponse)return user;
  if(!sameOriginMutation(request))return crossOriginResponse();
  const {id}=await params,source=ownedRenderJob(user.id,id);
  if(!source)return notFoundResponse();
  if(source.job.status!=="completed")return NextResponse.json({error:"The source render must be complete."},{status:409,headers:{"cache-control":"no-store"}});
  if(!hasProjectApproval(user.id,source.project.id,"timeline"))return NextResponse.json({error:"The current timeline approval is stale."},{status:409,headers:{"cache-control":"no-store"}});
  const admissionBlock=cloudRenderAdmissionBlock(process.env);
  if(admissionBlock)return NextResponse.json({error:admissionBlock},{status:503,headers:{"cache-control":"no-store"}});
  try{
    const body=JSON.parse(await readBoundedBody(request)) as Record<string,unknown>;
    if(typeof body.parentRenderVersion!=="string"||typeof body.revisionId!=="string"||!Array.isArray(body.audioAssets))return NextResponse.json({error:"Parent version, revision ID, and audio assets are required."},{status:400});
    const job=await createPostProductionExportJob({sourceRenderJobId:id,parentRenderVersion:body.parentRenderVersion,revisionId:body.revisionId,audioAssets:body.audioAssets as PostProductionAudioUpload[]});
    return NextResponse.json({job},{status:202,headers:{"cache-control":"no-store"}});
  }catch(error){
    const message=error instanceof Error?error.message:"Unable to export post-production revision.";
    const status=message==="BODY_TOO_LARGE"?413:message.includes("completed and available")?409:message.includes("queue is full")?429:400;
    return NextResponse.json({error:message==="BODY_TOO_LARGE"?"Post-production request exceeds the 32 MiB limit.":message},{status,headers:{"cache-control":"no-store"}});
  }
}
