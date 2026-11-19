export type GeminiCostEnvironment = Record<string, string | undefined>;
export type GeminiFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function positiveFinite(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Checks bounded worst-case cost before invoking fetch. Rates and ceiling are MYR. */
export async function fetchGeminiWithCostPreflight(
  fetcher: GeminiFetcher,
  url: string,
  init: RequestInit,
  requestUtf8ByteCount: number,
  maxOutputTokens: number,
  referenceImageCount: number,
  env: GeminiCostEnvironment,
) {
  const inputRate = positiveFinite(env.GEMINI_INPUT_MYR_PER_MILLION);
  const outputRate = positiveFinite(env.GEMINI_OUTPUT_MYR_PER_MILLION);
  const ceiling = positiveFinite(env.CCAI_GEMINI_MAX_REQUEST_COST_MYR);
  const imageRate = positiveFinite(env.GEMINI_REFERENCE_IMAGE_MYR_PER_IMAGE);
  if (inputRate === null || outputRate === null) throw new Error("Gemini live generation is blocked until positive input and output MYR rates are configured.");
  if (ceiling === null) throw new Error("Gemini live generation is blocked until a positive server-side maximum request cost is configured.");
  if (referenceImageCount > 0 && imageRate === null) throw new Error("Gemini reference images are blocked until a positive per-image MYR preflight rate is configured.");
  if (!Number.isSafeInteger(requestUtf8ByteCount) || requestUtf8ByteCount < 0 || !Number.isSafeInteger(maxOutputTokens) || maxOutputTokens <= 0 || !Number.isSafeInteger(referenceImageCount) || referenceImageCount < 0) {
    throw new Error("Gemini cost preflight could not calculate a safe request estimate.");
  }
  // One UTF-8 byte per estimated input token is deliberately conservative for text.
  // Inline image billing is separate and requires its own positive configured rate.
  const estimatedInputTokens = requestUtf8ByteCount;
  const estimatedCostMyr = (estimatedInputTokens * inputRate + maxOutputTokens * outputRate) / 1_000_000 + referenceImageCount * (imageRate || 0);
  if (!Number.isFinite(estimatedCostMyr) || estimatedCostMyr > ceiling) {
    throw new Error("Gemini request exceeds the configured maximum request cost. No provider request was sent.");
  }
  return { response: await fetcher(url, init), estimatedInputTokens, estimatedCostMyr };
}
