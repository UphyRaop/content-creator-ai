import { NextResponse } from "next/server";
import { getSessionUser, isSameOriginMutation, readBoundedRequestText } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const unavailable = () => NextResponse.json(
  {
    enabled: false,
    available: false,
    reason: "Developer mode requires a server-owned recent reauthentication capability that is not configured.",
  },
  { status: 503, headers: { "cache-control": "no-store" } },
);

/** Read-only status is authenticated so the endpoint cannot be used as an account probe. */
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: { "cache-control": "no-store" } });
  return unavailable();
}

/** Mutations remain disabled until recent reauthentication can be verified server-side. */
export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: { "cache-control": "no-store" } });
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Same-origin request required." }, { status: 403, headers: { "cache-control": "no-store" } });
  try {
    if ((await readBoundedRequestText(request, 1024)).length > 0) return NextResponse.json({ error: "Developer mode activation is unavailable." }, { status: 403, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_BODY_TOO_LARGE") return NextResponse.json({ error: "Request body is too large." }, { status: 413, headers: { "cache-control": "no-store" } });
    return NextResponse.json({ error: "Invalid developer mode request." }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  return unavailable();
}
