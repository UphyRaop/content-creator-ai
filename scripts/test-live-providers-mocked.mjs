import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const folder=mkdtempSync(join(tmpdir(),"ccai-provider-mock-"));
process.env.CCAI_DATABASE_PATH=join(folder,"ccai.sqlite");
process.env.CCAI_VOICE_VAULT_ENCRYPTION_KEY=Buffer.alloc(32,23).toString("base64");
process.env.CCAI_ENABLE_LIVE_AI="true";process.env.CCAI_LIVE_AI_APPROVED="true";process.env.GEMINI_API_KEY="SYNTHETIC_TEST_KEY";
process.env.GEMINI_INPUT_MYR_PER_MILLION="1";process.env.GEMINI_OUTPUT_MYR_PER_MILLION="2";process.env.CCAI_GEMINI_MAX_REQUEST_COST_MYR="1";
const originalFetch=globalThis.fetch;
try{
  const {GeminiScriptProvider}=await import("../src/lib/ai-provider.ts");
  const gemini=new GeminiScriptProvider(),request={idea:"A bakery opens",brief:{title:"Morning","direction":"Warm","goal":"Community",approved:true},referenceText:"",referenceNotes:"",referenceImages:[],referenceVideos:[],durationMinutes:1,language:"English",visualStyle:"Documentary",format:"narration"};
  let capturedSignal;
  globalThis.fetch=async(_url,init)=>{capturedSignal=init?.signal;return new Response(JSON.stringify({candidates:[{content:{parts:[{text:"The bakery opens before sunrise."}]}}]}),{status:200,headers:{"content-type":"application/json"}});};
  const missingUsage=await gemini.generate(request);
  assert.ok(missingUsage.usage.estimatedCostMyr>0,"missing usage metadata must preserve the conservative preflight cost");
  assert.ok(capturedSignal instanceof AbortSignal,"Gemini request is bounded by a timeout signal");
  globalThis.fetch=async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:"The bakery opens before sunrise."}]}}],usageMetadata:{promptTokenCount:10,candidatesTokenCount:5}}),{status:200,headers:{"content-type":"application/json"}});
  const reportedUsage=await gemini.generate(request);
  assert.equal(reportedUsage.usage.estimatedCostMyr,(10+10)/1_000_000,"valid provider usage is used for the estimate");
  console.log("PASS Gemini mocked success, bounded request, provider usage cost, and no-usage conservative fallback");

  process.env.CCAI_ENABLE_LIVE_IMAGES="true";process.env.CCAI_LIVE_IMAGES_APPROVED="true";process.env.FLUX_API_KEY="SYNTHETIC_TEST_KEY";process.env.CCAI_FLUX_PRICE_MYR_PER_IMAGE="0.01";process.env.CCAI_FLUX_OUTPUT_HOSTS="images.example.test";
  const {FluxSchnellImageProvider}=await import("../src/lib/image-provider.ts");
  const flux=new FluxSchnellImageProvider(),imageInput={id:"scene-test",prompt:"A bakery at dawn",scriptText:"The bakery opens.",aspectRatio:"16:9",spendingLimitMyr:1};
  let fluxCalls=0,redirectPolicy="";
  globalThis.fetch=async(url,init)=>{fluxCalls++;if(String(url).includes("flux-schnell"))return new Response(JSON.stringify({polling_url:"https://api.bfl.ai/v1/get_result?id=test"}),{status:200});if(String(url).includes("get_result"))return new Response(JSON.stringify({status:"Ready",result:{sample:"https://images.example.test/result.png?sig=synthetic"}}),{status:200});redirectPolicy=init?.redirect||"";return new Response(Buffer.from([137,80,78,71]),{status:200,headers:{"content-type":"image/png"}});};
  const image=await flux.generate(imageInput);
  assert.equal(image.provider,"flux-schnell");assert.equal(image.nativeWidth,1024);assert.ok(image.imageDataUrl.startsWith("data:image/png;base64,"));assert.equal(fluxCalls,3);assert.equal(redirectPolicy,"error");
  fluxCalls=0;
  globalThis.fetch=async(url)=>{fluxCalls++;return String(url).includes("flux-schnell")?new Response(JSON.stringify({polling_url:"https://api.bfl.ai/v1/get_result?id=test"}),{status:200}):new Response(JSON.stringify({status:"Ready",result:{sample:"https://127.0.0.1/private"}}),{status:200});};
  await assert.rejects(flux.generate(imageInput),/untrusted image URL/);assert.equal(fluxCalls,2,"untrusted output host must never be fetched");
  console.log("PASS FLUX mocked result, exact-host output retrieval, and SSRF host rejection");

  process.env.CCAI_ENABLE_LIVE_VOICE="true";process.env.CCAI_LIVE_VOICE_APPROVED="true";process.env.CCAI_ELEVENLABS_CREDITS_PER_CHARACTER="1";process.env.CCAI_ELEVENLABS_MYR_PER_1000_CREDITS="1";
  const {saveVoiceAccount,selectVoiceAccount}=await import("../src/lib/voice-vault.ts");
  const account=saveVoiceAccount("qa-owner",{label:"Synthetic test key",apiKey:"sk_SYNTHETIC_voice_test_key_123456"});selectVoiceAccount("qa-owner",account.id);
  const {ElevenLabsVoiceProvider}=await import("../src/lib/voice-provider.ts");const eleven=new ElevenLabsVoiceProvider();let voiceCalls=0,voiceHeader="";
  globalThis.fetch=async(_url,init)=>{voiceCalls++;voiceHeader=new Headers(init?.headers).get("xi-api-key")||"";return new Response(Buffer.from([1,2,3]),{status:200,headers:{"content-type":"audio/mpeg"}});};
  const audio=await eleven.generate({ownerId:"qa-owner",id:"voice-test",text:"Hello.",voiceId:"voice_synthetic",settings:{speed:1,stability:.55,similarity:.75,emotion:"Neutral",styleExaggeration:.2,pronunciation:""},spendingLimitMyr:1});
  assert.equal(audio.provider,"elevenlabs");assert.equal(voiceCalls,1);assert.equal(voiceHeader,"sk_SYNTHETIC_voice_test_key_123456");assert.ok(audio.audioDataUrl.startsWith("data:audio/mpeg;base64,"));
  console.log("PASS ElevenLabs mocked response uses server-vault key and returns validated audio bytes");
}finally{globalThis.fetch=originalFetch;rmSync(folder,{recursive:true,force:true});}
