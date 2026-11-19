import { NextResponse } from "next/server";
import { getSessionUser, isSameOriginMutation } from "@/lib/auth";
import { getOwnedProject } from "@/lib/project-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Cross-origin mutation rejected." }, { status: 403 });
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 16 * 1024) return NextResponse.json({ error: "Brief request is too large." }, { status: 413 });
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body) || typeof (body as Record<string, unknown>).projectId !== "string") return NextResponse.json({ error: "A saved project ID is required." }, { status: 400 });
    const project = getOwnedProject(user.id, (body as { projectId: string }).projectId);
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    const payload = project.payload;
    const settings = payload.settings && typeof payload.settings === "object" && !Array.isArray(payload.settings) ? payload.settings as Record<string, unknown> : {};
    if (typeof payload.idea !== "string" || !payload.idea.trim() || payload.idea.length > 4000) return NextResponse.json({ error: "Enter an idea between 1 and 4,000 characters in the saved project." }, { status: 400 });
    if (!Number.isInteger(settings.durationMinutes) || Number(settings.durationMinutes) < 1 || Number(settings.durationMinutes) > 5) return NextResponse.json({ error: "Choose a saved video duration from 1 to 5 minutes." }, { status: 400 });
    const referenceNotes = typeof payload.reference === "string" ? payload.reference : "";
    const referenceText = typeof payload.referenceText === "string" ? payload.referenceText : "";
    if ([referenceNotes, referenceText].some(value => value.length > 20_000)) return NextResponse.json({ error: "Saved reference notes exceed the 20,000-character limit." }, { status: 400 });
    const videos = Array.isArray(settings.referenceVideos) ? settings.referenceVideos : [];
    const images = Array.isArray(settings.referenceImages) ? settings.referenceImages : [];
    if (videos.length > 20 || videos.some(url => typeof url !== "string" || !/^https:\/\//i.test(url))) return NextResponse.json({ error: "Saved reference video links must be HTTPS URLs (up to 20)." }, { status: 400 });
    if (images.length > 12 || images.some(image => !image || typeof image !== "object")) return NextResponse.json({ error: "Saved reference image metadata is invalid (maximum 12)." }, { status: 400 });
    const duration = Number(settings.durationMinutes);
    const language = typeof settings.language === "string" ? settings.language : "English";
    const visualStyle = typeof settings.visualStyle === "string" ? settings.visualStyle : "Cinematic documentary";
    const title = payload.idea.trim().slice(0, 120), context = [referenceNotes, referenceText].filter(Boolean).join(" ").slice(0, 2000);
    return NextResponse.json({ provider: "simulated", estimatedCostMyr: 0, brief: { title, direction: `Create a ${duration}-minute ${visualStyle} video in ${language}. Use the idea${context ? ` and this user-supplied reference context: ${context}` : ""}. ${videos.length} reference video URL(s) and ${images.length} image reference(s) supplied; remote media is not fetched automatically.`, goal: `Audience: curious viewers. Goal: explain “${title}” clearly and leave one memorable takeaway.`, audience: "Curious viewers", durationMinutes: duration, tone: "Warm and clear", language, visualStyle, approved: false } });
  } catch {
    return NextResponse.json({ error: "Could not prepare the brief. Check the saved project inputs and try again." }, { status: 400 });
  }
}
