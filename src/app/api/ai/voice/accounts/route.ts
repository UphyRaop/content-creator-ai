import { NextResponse } from "next/server";
import { getSessionUser, isSameOriginMutation } from "@/lib/auth";
import { listVoiceAccounts, removeVoiceAccount, saveVoiceAccount, selectVoiceAccount } from "@/lib/voice-vault";

export const runtime = "nodejs";

function unavailable() {
  return NextResponse.json({ error: "Secure voice account storage is unavailable. Configure the vault encryption key on the private server." }, { status: 503, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: { "cache-control": "no-store" } });
  if (!process.env.CCAI_VOICE_VAULT_ENCRYPTION_KEY) return unavailable();
  try { return NextResponse.json({ accounts: listVoiceAccounts(user.id), creditBalance: null, balanceStatus: "not_checked" }, { headers: { "cache-control": "no-store" } }); }
  catch { return unavailable(); }
}

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: { "cache-control": "no-store" } });
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Cross-origin mutation rejected." }, { status: 403, headers: { "cache-control": "no-store" } });
  if (!process.env.CCAI_VOICE_VAULT_ENCRYPTION_KEY) return unavailable();
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 16_384) return NextResponse.json({ error: "Voice account request is too large." }, { status: 413, headers: { "cache-control": "no-store" } });
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (body.operation === "save" && typeof body.label === "string" && typeof body.apiKey === "string" && (body.id === undefined || typeof body.id === "string")) {
      const account = saveVoiceAccount(user.id, { label: body.label, apiKey: body.apiKey, id: body.id as string | undefined });
      return NextResponse.json({ account }, { headers: { "cache-control": "no-store" } });
    }
    if (body.operation === "select" && typeof body.id === "string") return NextResponse.json({ accounts: selectVoiceAccount(user.id, body.id) }, { headers: { "cache-control": "no-store" } });
    if (body.operation === "remove" && typeof body.id === "string") return NextResponse.json({ accounts: removeVoiceAccount(user.id, body.id) }, { headers: { "cache-control": "no-store" } });
    return NextResponse.json({ error: "Invalid voice account operation." }, { status: 400, headers: { "cache-control": "no-store" } });
  } catch (error) {
    // Never echo request fields or provider keys in API errors.
    const failedMigration = error instanceof Error && error.message.includes("owner-scope migration failed");
    return NextResponse.json({ error: failedMigration ? "Secure voice account storage is unavailable due to a storage migration error." : "Could not update the voice account." }, { status: failedMigration ? 503 : 400, headers: { "cache-control": "no-store" } });
  }
}
