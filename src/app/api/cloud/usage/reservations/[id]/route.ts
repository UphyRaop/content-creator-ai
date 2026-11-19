import { NextResponse } from "next/server";
import { getSessionUser, isSameOriginMutation } from "@/lib/auth";
import { releaseCloudResource } from "@/lib/cloud-metering";
export const runtime="nodejs";export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export async function DELETE(request:Request,{params}:Context){const user=await getSessionUser(request);if(!user)return NextResponse.json({error:"Authentication required."},{status:401});if(!isSameOriginMutation(request))return NextResponse.json({error:"Same-origin request required."},{status:403});const {id}=await params;const reservation=releaseCloudResource(user.id,id,"released");return reservation?NextResponse.json({reservation},{headers:{"cache-control":"no-store"}}):NextResponse.json({error:"Reservation not found."},{status:404});}
