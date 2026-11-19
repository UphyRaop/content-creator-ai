import { NextResponse } from "next/server";
import { listVoiceAccounts, removeVoiceAccount, saveVoiceAccount, selectVoiceAccount, verifyVoiceVaultAdminToken } from "@/lib/voice-vault";

export const runtime = "nodejs";
function authorized(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return false;
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) return false;
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : null;
  return verifyVoiceVaultAdminToken(token);
}
function unavailable() {
  return NextResponse.json({ error: "Secure voice account storage is unavailable. Configure the vault encryption key and admin token on the private server." }, { status: 503, headers: { "cache-control": "no-store" } });
}
export async function GET(request: Request) {
  if (!process.env.CCAI_VOICE_VAULT_ENCRYPTION_KEY || !process.env.CCAI_VOICE_VAULT_ADMIN_TOKEN) return unavailable();
  if (!authorized(request)) return NextResponse.json({ error: "Voice vault authorization failed." }, { status: 401, headers: { "cache-control": "no-store" } });
  return NextResponse.json({ accounts: listVoiceAccounts(), creditBalance: null, balanceStatus: "not_checked" }, { headers: { "cache-control": "no-store" } });
}
export async function POST(request: Request) {
  if (!process.env.CCAI_VOICE_VAULT_ENCRYPTION_KEY || !process.env.CCAI_VOICE_VAULT_ADMIN_TOKEN) return unavailable();
  if (!authorized(request)) return NextResponse.json({ error: "Voice vault authorization failed." }, { status: 401, headers: { "cache-control": "no-store" } });
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 16_384) return NextResponse.json({ error: "Voice account request is too large." }, { status: 413 });
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (body.operation === "save" && typeof body.label === "string" && typeof body.apiKey === "string" && (body.id === undefined || typeof body.id === "string")) {
      const account = saveVoiceAccount({ label: body.label, apiKey: body.apiKey, id: body.id as string | undefined });
      return NextResponse.json({ account }, { headers: { "cache-control": "no-store" } });
    }
    if (body.operation === "select" && typeof body.id === "string") return NextResponse.json({ accounts: selectVoiceAccount(body.id) }, { headers: { "cache-control": "no-store" } });
    if (body.operation === "remove" && typeof body.id === "string") return NextResponse.json({ accounts: removeVoiceAccount(body.id) }, { headers: { "cache-control": "no-store" } });
    return NextResponse.json({ error: "Invalid voice account operation." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update the voice account.";
    return NextResponse.json({ error: message }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
