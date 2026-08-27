import type {
  EvalCase,
  ContinuationType,
} from "../types.js";

export interface ContinuationEvaluationResult {
  passed: boolean;
  detectedContinuation: boolean;
  detectedType: ContinuationType;
  isForcedContinuation: boolean;
  failures: string[];
  warnings: string[];
}

/**
 * Deterministically checks for conversational continuation indicators:
 * - Questions (ending in '?' or interrogative sentence)
 * - Imperative practice task / exercise prompts (e.g. "Make a sentence...", "Tell me...", "Now try...")
 * - Structured multiple choices (e.g. "1. ... 2. ...", "Which would you prefer: A or B")
 */
function detectContinuationInText(text: string): {
  hasContinuation: boolean;
  type: ContinuationType;
} {
  const clean = text.trim();
  if (!clean) {
    return { hasContinuation: false, type: "natural_completion" };
  }

  // 1. Structured choice offering: "1. ... 2. ...", bulleted options, or "Which would you prefer"
  const optionListPattern = /(?:(?:1\.|1\))\s+[^\n]+[\r\n]+(?:2\.|2\))\s+[^\n]+)|(?:(?:Which|What)\s+would\s+you\s+prefer\s*[:?])/i;
  const choicePromptPattern = /(?:we\s+can\s+(?:practice|focus\s+on|do)\s*[:\n]|options\s*[:\n]|choices\s*[:\n])/i;
  if (optionListPattern.test(clean) || (choicePromptPattern.test(clean) && clean.includes("?"))) {
    return { hasContinuation: true, type: "offer_options" };
  }

  // 2. Direct question marks: check if last paragraph or sentence contains a question
  const hasQuestionMark = clean.includes("?");

  // 3. Imperative task / exercise prompts
  const imperativePromptPatterns = [
    /\b(?:make|create|write|form|give\s+me)\s+(?:a|an|your\s+own)\s+sentence\b/i,
    /\btell\s+me\s+(?:about|what|how|why)\b/i,
    /\b(?:now\s+)?try\s+(?:using|making|saying|to\s+use)\b/i,
    /\b(?:describe|explain)\s+(?:your|how|what)\b/i,
    /\bcomplete\s+(?:this|the)\s+sentence\b/i,
    /\blet['’]s\s+practice\b/i,
    /\bhow\s+would\s+you\s+(?:say|use|translate)\b/i,
    /\bwhat\s+(?:did|do|would|is|are|was|were|about)\b/i,
    /\bcan\s+you\s+(?:make|tell|give|use|try|think)\b/i,
    /\bwhich\s+(?:one|topic|would)\b/i,
  ];

  const hasImperativePrompt = imperativePromptPatterns.some((pattern) =>
    pattern.test(clean),
  );

  // 4. Topic transition signals
  const topicTransitionPatterns = [
    /\b(?:next|now\s+that\s+you|moving\s+on|let['’]s\s+move\s+to|shall\s+we\s+try)\b/i,
  ];
  const hasTopicTransition =
    topicTransitionPatterns.some((p) => p.test(clean)) && (hasQuestionMark || hasImperativePrompt);

  if (hasTopicTransition) {
    return { hasContinuation: true, type: "transition_topic" };
  }

  if (hasQuestionMark || hasImperativePrompt) {
    return { hasContinuation: true, type: "continue_activity" };
  }

  return { hasContinuation: false, type: "natural_completion" };
}

/**
 * Evaluates whether the Agent's response adheres to the expected continuation or natural completion policy.
 */
export function evaluateContinuation(
  actualResponse: string | undefined,
  evalCase: EvalCase,
): ContinuationEvaluationResult {
  const failures: string[] = [];
  const warnings: string[] = [];

  const text = actualResponse ?? "";
  const { hasContinuation, type: detectedType } = detectContinuationInText(text);

  // Determine expectation: check both root evalCase field and expectations.response.continuation
  const expectsContinuation =
    evalCase.expectsContinuation ??
    evalCase.expectations.response?.continuation?.expectsContinuation;

  const expectedType =
    evalCase.expectedContinuationType ??
    evalCase.expectations.response?.continuation?.expectedType;

  let isForcedContinuation = false;

  // Case A: Continuation was explicitly EXPECTED (e.g. active learning, grammar explanation, small talk)
  if (expectsContinuation === true) {
    if (!hasContinuation) {
      failures.push(
        `Expected conversational continuation (question, practice task, or options), but response ended without a follow-up.`,
      );
    } else if (expectedType && expectedType !== detectedType) {
      // If a specific continuation type was expected (e.g. offer_options), check if it matched
      if (expectedType === "offer_options" && detectedType !== "offer_options") {
        warnings.push(
          `Expected continuation type "${expectedType}", but detected "${detectedType}".`,
        );
      }
    }
  }

  // Case B: Natural completion was EXPECTED (e.g. user said goodbye, "I'm done", "That's enough")
  if (expectsContinuation === false) {
    // If the agent aggressively demands another exercise or asks an unprompted question when user said goodbye:
    const aggressiveQuestionPattern = /(?:what\s+did\s+you|make\s+a\s+sentence|now\s+try|tell\s+me|can\s+you\s+make)/i;
    if (hasContinuation && aggressiveQuestionPattern.test(text)) {
      isForcedContinuation = true;
      failures.push(
        `User signaled completion/goodbye, but Agent forced an unprompted follow-up question/exercise.`,
      );
    }
  }

  const passed = failures.length === 0;

  return {
    passed,
    detectedContinuation: hasContinuation,
    detectedType,
    isForcedContinuation,
    failures,
    warnings,
  };
}
