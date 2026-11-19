import { NextResponse } from "next/server";
import { revokeSession } from "@/lib/auth-store";
import { clearSessionCookie, isSameOriginMutation } from "@/lib/auth";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request){if(!isSameOriginMutation(request))return NextResponse.json({error:"Same-origin request required."},{status:403});const token=(request.headers.get("cookie")||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("ccai_session="))?.slice("ccai_session=".length);if(token){try{revokeSession(decodeURIComponent(token));}catch{}}return NextResponse.json({ok:true},{headers:{"cache-control":"no-store","set-cookie":clearSessionCookie(request)}});}
