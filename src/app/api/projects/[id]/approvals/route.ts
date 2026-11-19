import { NextResponse } from "next/server";
import { approveProjectStage, type ProjectApprovalStage } from "@/lib/approval-store";
import { getSessionUser, isSameOriginMutation } from "@/lib/auth";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
async function readBody(request:Request){const declared=Number(request.headers.get("content-length")||0);if(declared>8192)throw new Error("APPROVAL_BODY_TOO_LARGE");const reader=request.body?.getReader();if(!reader)return {};const chunks:Uint8Array[]=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();throw new Error("APPROVAL_BODY_TOO_LARGE");}chunks.push(value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));}
export async function POST(request:Request,{params}:Context){
  const user=await getSessionUser(request);if(!user)return NextResponse.json({error:"Authentication required."},{status:401,headers:{"cache-control":"no-store"}});
  if(!isSameOriginMutation(request))return NextResponse.json({error:"Same-origin request required."},{status:403,headers:{"cache-control":"no-store"}});
  try{
    const body=await readBody(request) as Record<string,unknown>;const {id}=await params;
    if(typeof body.stage!=="string"||!(["brief","script","image","voice","timeline","thumbnail","export"] as string[]).includes(body.stage))return NextResponse.json({error:"Unknown approval stage."},{status:400});
    if(body.resourceId!==undefined&&body.resourceId!==null&&typeof body.resourceId!=="string")return NextResponse.json({error:"Invalid approval resource ID."},{status:400});
    const approval=approveProjectStage(user.id,id,body.stage as ProjectApprovalStage,body.resourceId as string|null|undefined);
    return NextResponse.json({approval},{status:201,headers:{"cache-control":"no-store"}});
  }catch(error){const message=error instanceof Error?error.message:"Unable to record approval.";const status=message==="APPROVAL_BODY_TOO_LARGE"?413:message==="Project not found."?404:/Approve|requires an approved|requires at least/i.test(message)?409:400;return NextResponse.json({error:message==="APPROVAL_BODY_TOO_LARGE"?"Approval request is too large.":message},{status,headers:{"cache-control":"no-store"}});}
}
