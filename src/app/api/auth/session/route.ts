import { NextResponse } from "next/server";
import { countUsers } from "@/lib/auth-store";
import { getSessionUser } from "@/lib/auth";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){const user=await getSessionUser(request);return NextResponse.json(user?{authenticated:true,user}:{authenticated:false,bootstrapAvailable:!!process.env.CCAI_BOOTSTRAP_TOKEN&&countUsers()===0},{headers:{"cache-control":"no-store"}});}
