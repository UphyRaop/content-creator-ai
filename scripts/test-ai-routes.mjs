import assert from "node:assert/strict";
import { scriptRequestFromSavedProject, imageRequestFromSavedProject } from "../src/lib/ai-generation-gates.ts";
import { fetchGeminiWithCostPreflight } from "../src/lib/gemini-cost-preflight.ts";
import { validateScriptRequest } from "../src/lib/script-workflow.ts";
import { validateImageGenerationRequest } from "../src/lib/image-workflow.ts";
import { validateFluxOutputUrl } from "../src/lib/flux-url-safety.ts";
import { providerAdmissionBlock, cloudRenderAdmissionBlock } from "../src/lib/provider-admission.ts";

const saved = {
  idea: "A family bakery",
  reference: "A warm neighborhood story",
  referenceText: "Open since 1980",
  brief: { title: "The Bakery", direction: "Follow a family recipe", goal: "Show community", approved: true },
  script: "The bakery opens before sunrise.",
  scriptFormat: "mixed",
  scriptApproved: true,
  imageSpendingLimitMyr: 0,
  settings: { durationMinutes: 2, aspectRatio: "16:9", language: "English", visualStyle: "Documentary", referenceImages: [], referenceVideos: ["https://example.test/story"] },
  scenes: [
    { id: "saved-scene", prompt: "Saved approved-project prompt", line: "The baker kneads dough.", approvalStatus: "pending", approved: false },
    { id: "approved-scene", prompt: "Already approved", line: "An approved scene.", approvalStatus: "approved", approved: true },
  ],
};

const scriptRequest = scriptRequestFromSavedProject(saved);
assert.equal(validateScriptRequest(scriptRequest), true);
assert.equal(scriptRequest.idea, saved.idea);
assert.equal(scriptRequest.brief.title, saved.brief.title);
assert.equal(scriptRequest.brief.approved, true);
assert.equal(scriptRequest.durationMinutes, saved.settings.durationMinutes);
assert.throws(() => scriptRequestFromSavedProject({ ...saved, brief: { ...saved.brief, approved: false } }), /Approve the saved creative brief/);
assert.throws(() => scriptRequestFromSavedProject({ ...saved, brief: null }), /Approve the saved creative brief/);
console.log("PASS script request is derived from saved project data and requires saved brief approval");

const imageRequest = imageRequestFromSavedProject(saved, ["saved-scene"]);
assert.equal(validateImageGenerationRequest(imageRequest), true);
assert.equal(imageRequest.scenes[0].prompt, "Saved approved-project prompt");
assert.equal(imageRequest.scenes[0].scriptText, "The baker kneads dough.");
assert.throws(() => imageRequestFromSavedProject({ ...saved, scriptApproved: false }, ["saved-scene"]), /Approve the saved creative brief and script/);
assert.throws(() => imageRequestFromSavedProject(saved, ["approved-scene"]), /Approved scene images cannot be regenerated/);
assert.throws(() => imageRequestFromSavedProject(saved, ["attacker-scene"]), /does not belong to the saved project/);
console.log("PASS image request uses saved prompts, script and approval states; rejects unapproved/missing project state");

let fetchCalls = 0;
const stubFetch = async () => {
  fetchCalls += 1;
  return { ok: true, status: 200 };
};
const baseEnv = {
  GEMINI_INPUT_MYR_PER_MILLION: "1",
  GEMINI_OUTPUT_MYR_PER_MILLION: "2",
  CCAI_GEMINI_MAX_REQUEST_COST_MYR: "1",
};
const init = { method: "POST", body: "{}" };
await assert.rejects(fetchGeminiWithCostPreflight(stubFetch, "https://example.test", init, 100, 100, 0, { ...baseEnv, GEMINI_INPUT_MYR_PER_MILLION: "" }), /positive input and output/);
await assert.rejects(fetchGeminiWithCostPreflight(stubFetch, "https://example.test", init, 100, 100, 0, { ...baseEnv, CCAI_GEMINI_MAX_REQUEST_COST_MYR: "" }), /positive server-side maximum/);
await assert.rejects(fetchGeminiWithCostPreflight(stubFetch, "https://example.test", init, 100, 100, 1, baseEnv), /reference images are blocked/);
await assert.rejects(fetchGeminiWithCostPreflight(stubFetch, "https://example.test", init, 1_000_000, 1_000_000, 0, baseEnv), /exceeds the configured maximum/);
assert.equal(fetchCalls, 0, "invalid or over-ceiling preflight must not invoke fetch");
console.log("PASS unknown Gemini rates, missing ceiling, unpriced reference images, and over-ceiling estimates block before fetch");

const allowed = await fetchGeminiWithCostPreflight(stubFetch, "https://example.test", init, 100, 100, 0, baseEnv);
assert.equal(fetchCalls, 1);
assert.equal(allowed.estimatedInputTokens, 100, "UTF-8 bytes are used as the conservative text token estimate");
assert.equal(allowed.estimatedCostMyr, (100 + 200) / 1_000_000);
console.log("PASS configured under-ceiling preflight calls only the supplied test fetcher and returns a conservative estimate");

assert.equal(validateFluxOutputUrl("https://images.example.test/object?sig=redacted",["images.example.test"]).hostname,"images.example.test");
for(const url of ["http://images.example.test/a","https://127.0.0.1/a","https://images.example.test:8443/a","https://user@images.example.test/a","https://evil.example.test/a"]){
  assert.throws(()=>validateFluxOutputUrl(url,["images.example.test"]),/untrusted image URL/);
}
assert.throws(()=>validateFluxOutputUrl("https://images.example.test/a",[]),/untrusted image URL/);
console.log("PASS FLUX output downloads require a configured exact HTTPS host without credentials or custom ports");
assert.equal(providerAdmissionBlock("simulated"),null);
assert.match(providerAdmissionBlock("gemini"),/metered admission/);
assert.match(providerAdmissionBlock("flux-schnell"),/durable job reconciliation/);
assert.equal(cloudRenderAdmissionBlock({}),null);
assert.match(cloudRenderAdmissionBlock({K_SERVICE:"ccai"}),/durable job records/);
assert.match(cloudRenderAdmissionBlock({K_JOB:"render"}),/usage reservations/);
console.log("PASS direct API provider and Cloud Run render admission remain fail-closed until durable metering is active");
