import "server-only";
import { getSelectedVoiceAccountSecret } from "@/lib/voice-vault";
import { estimateVoiceCostMyr, estimateVoiceCredits, type VoiceSettings } from "@/lib/voice-workflow";

export type VoiceGenerationInput = { id: string; text: string; voiceId: string; settings: VoiceSettings; spendingLimitMyr: number };
export type VoiceGenerationResult = { id: string; audioDataUrl: string; durationSeconds: number | null; provider: "simulated" | "elevenlabs"; accountId: string; characters: number; credits: number | null; estimatedCostMyr: number | null; actualCostMyr: number | null };
export interface VoiceProvider { readonly id: "simulated" | "elevenlabs"; readonly capabilities: { speed: boolean; stability: boolean; similarity: boolean; emotion: boolean; styleExaggeration: boolean; pronunciation: boolean; multilingual: boolean }; generate(input: VoiceGenerationInput): Promise<VoiceGenerationResult> }
function simulatedTone(id: string, durationSeconds: number) {
  const rate = 4000, seconds = Math.min(120, Math.max(.5, durationSeconds)), samples = Math.floor(rate * seconds), bytes = Buffer.alloc(44 + samples);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(36 + samples, 4); bytes.write("WAVE", 8); bytes.write("fmt ", 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate, 28); bytes.writeUInt16LE(1, 32); bytes.writeUInt16LE(8, 34); bytes.write("data", 36); bytes.writeUInt32LE(samples, 40);
  const base = 330 + [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 220;
  for (let i = 0; i < samples; i++) { const envelope = Math.min(1, i / 120) * Math.min(1, (samples - i) / 120); bytes[44 + i] = Math.max(0, Math.min(255, Math.round(128 + Math.sin((i / rate) * Math.PI * 2 * base) * 12 * envelope))); }
  return `data:audio/wav;base64,${bytes.toString("base64")}`;
}
export class SimulatedVoiceProvider implements VoiceProvider {
  readonly id = "simulated" as const;
  readonly capabilities = { speed: true, stability: true, similarity: true, emotion: true, styleExaggeration: true, pronunciation: true, multilingual: true };
  async generate(input: VoiceGenerationInput): Promise<VoiceGenerationResult> {
    const characters = input.text.length;
    const durationSeconds = Math.max(.5, Number((characters / 15).toFixed(2)));
    return { id: input.id, audioDataUrl: simulatedTone(input.id, durationSeconds), durationSeconds, provider: this.id, accountId: "simulated", characters, credits: 0, estimatedCostMyr: 0, actualCostMyr: 0 };
  }
}
/** Server-only ElevenLabs adapter. It is deliberately blocked until separately approved. */
export class ElevenLabsVoiceProvider implements VoiceProvider {
  readonly id = "elevenlabs" as const;
  readonly capabilities = { speed: true, stability: true, similarity: true, emotion: false, styleExaggeration: true, pronunciation: false, multilingual: true };
  async generate(input: VoiceGenerationInput): Promise<VoiceGenerationResult> {
    if (process.env.CCAI_ENABLE_LIVE_VOICE !== "true" || process.env.CCAI_LIVE_VOICE_APPROVED !== "true") throw new Error("Live voice generation is disabled. Use the simulated preview or obtain separate approval before enabling API calls.");
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(input.voiceId)) throw new Error("Choose an authorized ElevenLabs voice profile.");
    if (input.settings.speed < 0.7 || input.settings.speed > 1.2) throw new Error("The selected ElevenLabs model supports speed from 0.7 to 1.2.");
    if (input.settings.emotion !== "Neutral") throw new Error("This ElevenLabs adapter has no verified direct emotional-delivery control. Choose Neutral or use simulated audio.");
    if (input.settings.pronunciation.trim()) throw new Error("Free-text pronunciation notes are not sent to ElevenLabs because a verified pronunciation dictionary is not configured.");
    const account = getSelectedVoiceAccountSecret();
    if (!account) throw new Error("Select a securely stored ElevenLabs account first.");
    const creditRateText = process.env.CCAI_ELEVENLABS_CREDITS_PER_CHARACTER || "";
    const creditRate = creditRateText.trim() ? Number(creditRateText) : undefined;
    const credits = estimateVoiceCredits(input.text.length, this.id, creditRate);
    const myrRateText = process.env.CCAI_ELEVENLABS_MYR_PER_1000_CREDITS || "";
    const myrRate = myrRateText.trim() ? Number(myrRateText) : undefined;
    const estimatedCostMyr = estimateVoiceCostMyr(credits, myrRate);
    if (credits === null || estimatedCostMyr === null) throw new Error("Current ElevenLabs credit and MYR pricing are unknown; live generation is blocked.");
    if (estimatedCostMyr > input.spendingLimitMyr || input.spendingLimitMyr <= 0) throw new Error("This project's voice spending limit would be exceeded.");
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(input.voiceId)}?output_format=mp3_44100_128`, {
      method: "POST", headers: { "content-type": "application/json", "xi-api-key": account.apiKey },
      body: JSON.stringify({ text: input.text, model_id: process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2", voice_settings: { speed: input.settings.speed, stability: input.settings.stability, similarity_boost: input.settings.similarity, style: input.settings.styleExaggeration, use_speaker_boost: true } }),
      cache: "no-store", signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`ElevenLabs request failed (${response.status}). Check the selected account and retry.`);
    const data = Buffer.from(await response.arrayBuffer());
    if (!data.length || data.length > 20 * 1024 * 1024) throw new Error("ElevenLabs returned an invalid audio file.");
    return { id: input.id, audioDataUrl: `data:audio/mpeg;base64,${data.toString("base64")}`, durationSeconds: null, provider: this.id, accountId: account.accountId, characters: input.text.length, credits, estimatedCostMyr, actualCostMyr: null };
  }
}
export function getVoiceProvider(): VoiceProvider {
  if (process.env.CCAI_VOICE_PROVIDER === "elevenlabs") return new ElevenLabsVoiceProvider();
  return new SimulatedVoiceProvider();
}
