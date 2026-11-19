import "server-only";
import { createSimulatedScript, estimateCostMyr, estimatedDurationSeconds, wordCount, type ScriptDraft, type ScriptRequest } from "@/lib/script-workflow";
import { fetchGeminiWithCostPreflight } from "@/lib/gemini-cost-preflight";
export type ProviderUsage = { provider: "simulated" | "gemini"; inputTokens: number; outputTokens: number; estimatedCostMyr: number | null };
export type ScriptProvider = { readonly id: ProviderUsage["provider"]; generate(request: ScriptRequest): Promise<{ draft: ScriptDraft; usage: ProviderUsage }> };
export class SimulatedScriptProvider implements ScriptProvider {
  readonly id = "simulated" as const;
  async generate(request: ScriptRequest) { const draft=createSimulatedScript(request), inputTokens=Math.ceil(JSON.stringify(request).length/4), outputTokens=Math.ceil(draft.text.length/4); return {draft,usage:{provider:this.id,inputTokens,outputTokens,estimatedCostMyr:0}}; }
}
/** Server-only Gemini adapter. Live requests require two explicit opt-in flags and a server secret. */
export class GeminiScriptProvider implements ScriptProvider {
  readonly id = "gemini" as const;
  async generate(request: ScriptRequest) {
    if(process.env.CCAI_ENABLE_LIVE_AI!=="true"||process.env.CCAI_LIVE_AI_APPROVED!=="true") throw new Error("Live AI is disabled. Use simulated generation or obtain separate approval before enabling API calls.");
    const key=process.env.GEMINI_API_KEY;if(!key)throw new Error("Gemini is not configured. Add the key to the server environment.");
    const model=process.env.GEMINI_MODEL||"gemini-2.5-flash";
    const maxOutputTokens=Math.min(8192,request.durationMinutes*1200);
    const apiBody={systemInstruction:{parts:[{text:`Write a production-ready ${request.format} video script in ${request.language}, about ${request.durationMinutes} minutes. Visual style: ${request.visualStyle}. Return script text only and follow the approved brief.`}]},contents:[{role:"user",parts:[{text:JSON.stringify({idea:request.idea,brief:request.brief,referenceNotes:request.referenceNotes,referenceText:request.referenceText,referenceImages:(request.referenceImages||[]).map(({dataUrl,...metadata})=>metadata),referenceVideos:request.referenceVideos})},...(request.referenceImages||[]).filter(image=>image.dataUrl).map(image=>({inlineData:{mimeType:image.mimeType||image.dataUrl!.slice(5,image.dataUrl!.indexOf(";")),data:image.dataUrl!.slice(image.dataUrl!.indexOf(",")+1)}}))]}],generationConfig:{temperature:.7,maxOutputTokens}};
    const body=JSON.stringify(apiBody);
    const referenceImageCount=(request.referenceImages||[]).length;
    const preflight=await fetchGeminiWithCostPreflight(fetch,`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:"POST",headers:{"content-type":"application/json","x-goog-api-key":key},body,cache:"no-store",signal:AbortSignal.timeout(45_000)},new TextEncoder().encode(body).length,maxOutputTokens,referenceImageCount,process.env);
    const {response}=preflight;
    if(!response.ok)throw new Error(`Gemini request failed (${response.status}). Check server configuration and retry.`);
    const result=await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const text=result.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("").trim();if(!text)throw new Error("Gemini returned an empty script. Please try again.");
    const inputTokens=result.usageMetadata?.promptTokenCount||0,outputTokens=result.usageMetadata?.candidatesTokenCount||0,inputRate=Number(process.env.GEMINI_INPUT_MYR_PER_MILLION),outputRate=Number(process.env.GEMINI_OUTPUT_MYR_PER_MILLION),words=wordCount(text,request.language);
    const imageRateRaw=process.env.GEMINI_REFERENCE_IMAGE_MYR_PER_IMAGE;
    const imageRate=imageRateRaw?.trim()?Number(imageRateRaw):0;
    // Use provider usage when present. If the provider omits/malforms usage metadata,
    // keep the conservative preflight estimate instead of recording a misleading RM0.
    const usage=result.usageMetadata;
    const hasUsage=Number.isSafeInteger(usage?.promptTokenCount)&&Number(usage?.promptTokenCount)>=0&&Number.isSafeInteger(usage?.candidatesTokenCount)&&Number(usage?.candidatesTokenCount)>=0;
    const tokenCost=hasUsage?estimateCostMyr(inputTokens,outputTokens,inputRate,outputRate):null;
    const estimatedCostMyr=tokenCost===null?preflight.estimatedCostMyr:tokenCost+referenceImageCount*imageRate;
    return {draft:{text,wordCount:words,estimatedSeconds:estimatedDurationSeconds(text,140,request.language),format:request.format},usage:{provider:this.id,inputTokens,outputTokens,estimatedCostMyr}};
  }
}
export function getScriptProvider():ScriptProvider{return process.env.CCAI_SCRIPT_PROVIDER==="gemini"?new GeminiScriptProvider():new SimulatedScriptProvider();}
