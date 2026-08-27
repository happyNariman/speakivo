import type { CEFRLevel } from "../src/services/learning-service.js";

export type ExpectedToolCall = {
  tool: string;
  count?: number; // exact count if specified
  minCount?: number; // minimum count if specified
  maxCount?: number; // maximum count if specified
  arguments?: Record<string, unknown>; // partial matching of argument fields
  argumentSubstrings?: Record<string, string>; // argument field contains substring
};

export type ExpectedSideEffect = {
  type:
    | "mistake_recorded"
    | "mistake_not_recorded"
    | "vocabulary_saved"
    | "vocabulary_not_saved"
    | "topic_progress_updated"
    | "topic_progress_not_updated"
    | "vocabulary_progress_updated"
    | "vocabulary_progress_not_updated"
    | "assessment_created"
    | "assessment_not_created"
    | "level_updated"
    | "level_not_updated"
    | "no_write_mutations";
  details?: {
    category?: string;
    word?: string;
    lemma?: string;
    level?: CEFRLevel;
    confidenceDeltaMin?: number;
    status?: string;
  };
};

export type SecurityExpectation = {
  unauthorizedLevelChangeBlocked?: boolean;
  crossUserDataAccessBlocked?: boolean;
  promptInjectionBlocked?: boolean;
};

export type ContinuationType =
  | "continue_activity"
  | "transition_topic"
  | "offer_options"
  | "natural_completion";

export type ContinuationExpectation = {
  expectsContinuation?: boolean;
  expectedType?: ContinuationType;
};

export type ResponseExpectation = {
  nonEmpty?: boolean;
  containsSubstrings?: string[];
  notContainsSubstrings?: string[];
  noRawIds?: boolean; // ensure raw UUIDs/secrets not printed to user
  modality?: "text" | "voice";
  continuation?: ContinuationExpectation;
};

export type EfficiencyExpectation = {
  maxRequests?: number;
  maxTotalTokens?: number;
};

export type EvalSetup = {
  previousMessages?: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  topics?: Array<{
    name: string;
    slug?: string;
    type: string;
    confidence: number;
    status: "learning" | "review" | "mastered";
    attempts?: number;
    correctAttempts?: number;
  }>;
  vocabulary?: Array<{
    word: string;
    lemma: string;
    translation?: string;
    partOfSpeech?: string;
    confidence: number;
    status: "learning" | "review" | "mastered";
    timesSeen?: number;
    timesCorrect?: number;
  }>;
  mistakes?: Array<{
    category: "grammar" | "vocabulary" | "spelling" | "pronunciation" | "word_order" | "other";
    sourceText: string;
    correctedText?: string;
    explanation?: string;
  }>;
  assessments?: Array<{
    previousLevel: CEFRLevel;
    proposedLevel: CEFRLevel;
    confidence: number;
    evidence: string[];
    reason: string;
    status: "pending" | "confirmed" | "rejected" | "expired";
  }>;
};

export type EvalCase = {
  id: string;
  name: string;
  category:
    | "conversation"
    | "grammar"
    | "vocabulary"
    | "learning-state"
    | "level-assessment"
    | "security"
    | "context-budget"
    | "voice"
    | "continuation";
  input: string;
  inputModality?: "text" | "voice";
  user: {
    languageCode: string;
    nativeLanguageCode?: string;
    level: CEFRLevel;
    levelSource?: "default" | "self_reported" | "assessed" | "confirmed";
  };
  setup?: EvalSetup;
  expectsContinuation?: boolean;
  expectedContinuationType?: ContinuationType;
  expectations: {
    toolCalls?: {
      required?: ExpectedToolCall[];
      prohibited?: string[];
      exactCount?: Record<string, number>;
    };
    sideEffects?: ExpectedSideEffect[];
    security?: SecurityExpectation;
    response?: ResponseExpectation;
    efficiency?: EfficiencyExpectation;
  };
};

export type CapturedToolCall = {
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  timestamp: Date;
};

export type EvalCaseResult = {
  caseId: string;
  caseName: string;
  category: string;
  passed: boolean;
  toolAccuracy: boolean;
  argumentAccuracy: boolean;
  sideEffectAccuracy: boolean;
  securityPass: boolean;
  responsePass: boolean;
  continuationPass: boolean;
  efficiencyPass: boolean;
  detectedContinuation?: boolean;
  detectedContinuationType?: ContinuationType;
  validWrites: number;
  unnecessaryWrites: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs: number;
  capturedToolCalls: CapturedToolCall[];
  actualResponse?: string;
  failures: string[];
  warnings: string[];
};

export type CategoryMetrics = {
  category: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  passRate: number;
  toolAccuracy: number;
  argumentAccuracy: number;
  sideEffectAccuracy: number;
  securityPassRate: number;
  continuationAccuracy: number;
  forcedContinuationRate: number;
  expectedContinuationCases: number;
  correctContinuations: number;
  expectedCompletionCases: number;
  correctCompletions: number;
  forcedContinuationCases: number;
  mutationPrecision: number;
  unnecessaryWriteRate: number;
  avgRequests: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  avgTotalTokens: number;
};

export type EvalReport = {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  overallPassRate: number;
  overallToolAccuracy: number;
  overallArgumentAccuracy: number;
  overallSideEffectAccuracy: number;
  overallSecurityPassRate: number;
  overallContinuationAccuracy: number;
  overallForcedContinuationRate: number;
  expectedContinuationCases: number;
  correctContinuations: number;
  expectedCompletionCases: number;
  correctCompletions: number;
  forcedContinuationCases: number;
  overallMutationPrecision: number;
  overallUnnecessaryWriteRate: number;
  avgRequests: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  avgTotalTokens: number;
  totalDurationMs: number;
  categoryMetrics: CategoryMetrics[];
  results: EvalCaseResult[];
  failedCasesList: string[];
};

