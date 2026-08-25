export type ResponseModality = "text" | "voice";

export interface ModalityDecision {
  inputModality: ResponseModality;
  requestedOutputModality?: ResponseModality;
  agentSelectedOutputModality: ResponseModality;
  finalOutputModality: ResponseModality;
  reason?: string;
}

/**
 * Deterministically checks whether the input text contains an explicit request for output modality.
 * Returns "voice" | "text" | undefined.
 *
 * Negative mentions (e.g. "What is a voice message?", "Why do people send voice?") do NOT trigger voice requests.
 */
export function detectExplicitModalityRequest(
  text: string,
): ResponseModality | undefined {
  const normalized = text.toLowerCase().trim();

  // Explicit text requests
  const textPatterns = [
    /\b(answer|reply|respond|write|send)\s+(in|as|via|with|using)?\s*(text|writing|written|words)\b/i,
    /\b(please\s+)?(write\s+(the\s+)?answer|answer\s+in\s+writing|reply\s+in\s+writing)\b/i,
    /\b(don'?t|do\s+not)\s+(send|reply\s+with|use)\s+(a\s+)?(voice|audio)\b/i,
    /\b(text\s+only|no\s+voice|no\s+audio)\b/i,
  ];

  for (const pattern of textPatterns) {
    if (pattern.test(normalized)) {
      return "text";
    }
  }

  // Explicit voice requests
  const voicePatterns = [
    /\b(answer|reply|respond|say\s+it)\s+(in|as|via|with|using|by)?\s*(a\s+)?(voice|voice\s+message|audio|verbally|out\s+loud|speech)\b/i,
    /\b(please\s+)?(speak\s+to\s+me|send\s+(a\s+)?voice(\s+message)?|reply\s+by\s+voice|answer\s+with\s+(a\s+)?voice)\b/i,
    /\b(can\s+you\s+)?(say|pronounce|speak|explain|read)(\s+[\w\s'"]+)?\s+(out\s+loud|verbally|using\s+your\s+voice|in\s+voice|by\s+voice)\b/i,
    /\b(i\s+want\s+to\s+hear|let\s+me\s+hear)\s+(how\s+it\s+sounds|your\s+voice|this\s+spoken)\b/i,
    /\b(voice\s+only|answer\s+verbally|reply\s+verbally)\b/i,
  ];

  for (const pattern of voicePatterns) {
    if (pattern.test(normalized)) {
      return "voice";
    }
  }

  return undefined;
}
