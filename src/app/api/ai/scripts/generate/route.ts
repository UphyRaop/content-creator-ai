import { NextResponse } from "next/server";
import { getScriptProvider } from "@/lib/ai-provider";
import { validateScriptRequest } from "@/lib/script-workflow";
export const runtime="nodejs";
export async function POST(request:Request){try{const raw=await request.text();if(Buffer.byteLength(raw,"utf8")>40*1024*1024)return NextResponse.json({error:"Script request is too large. Remove some reference images and try again."},{status:413});const body:unknown=JSON.parse(raw);if(!validateScriptRequest(body))return NextResponse.json({error:"Invalid script request. Add an idea, approve the creative brief, and check settings and references."},{status:400});return NextResponse.json(await getScriptProvider().generate(body))}catch(error){const message=error instanceof Error?error.message:"Script generation failed. Please try again.";return NextResponse.json({error:message},{status:message.includes("disabled")||message.includes("not configured")?503:502})}}
