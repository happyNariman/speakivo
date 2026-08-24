import type {
  EvalCase,
  CapturedToolCall,
  EvalCaseResult,
} from "../types.js";
import type { EvalFixtureContext } from "../fixtures/test-fixtures.js";
import { evaluateToolCalls } from "./tool-calls.js";
import { evaluateToolArguments } from "./tool-arguments.js";
import { evaluateSideEffects } from "./side-effects.js";
import { evaluateSecurity } from "./security.js";
import { evaluateResponse } from "./response.js";
import { evaluateEfficiency } from "./efficiency.js";

export async function evaluateCase(
  evalCase: EvalCase,
  fixture: EvalFixtureContext,
  capturedToolCalls: CapturedToolCall[],
  responseText: string,
  requests: number,
  inputTokens: number,
  outputTokens: number,
  durationMs: number,
): Promise<EvalCaseResult> {
  const totalTokens = inputTokens + outputTokens;
  const failures: string[] = [];
  const warnings: string[] = [];

  // 1. Evaluate tool selection & counts (including unnecessary writes)
  const toolResult = evaluateToolCalls(evalCase, capturedToolCalls);
  if (!toolResult.passed) {
    failures.push(...toolResult.failures);
  }

  // 2. Evaluate tool arguments
  const argResult = evaluateToolArguments(evalCase, capturedToolCalls);
  if (!argResult.passed) {
    failures.push(...argResult.failures);
  }

  // 3. Evaluate database side effects
  const sideEffectResult = await evaluateSideEffects(evalCase, fixture);
  if (!sideEffectResult.passed) {
    failures.push(...sideEffectResult.failures);
  }

  // 4. Evaluate security invariants
  const securityResult = await evaluateSecurity(evalCase, fixture);
  if (!securityResult.passed) {
    failures.push(...securityResult.failures);
  }

  // 5. Evaluate response text
  const responseResult = evaluateResponse(evalCase, responseText);
  if (!responseResult.passed) {
    failures.push(...responseResult.failures);
  }

  // 6. Evaluate efficiency
  const efficiencyResult = evaluateEfficiency(evalCase, requests, totalTokens);
  if (!efficiencyResult.passed) {
    failures.push(...efficiencyResult.failures);
  }

  const passed = failures.length === 0;

  return {
    caseId: evalCase.id,
    caseName: evalCase.name,
    category: evalCase.category,
    passed,
    toolAccuracy: toolResult.passed,
    argumentAccuracy: argResult.passed,
    sideEffectAccuracy: sideEffectResult.passed,
    securityPass: securityResult.passed,
    responsePass: responseResult.passed,
    efficiencyPass: efficiencyResult.passed,
    validWrites: toolResult.validWrites,
    unnecessaryWrites: toolResult.unnecessaryWrites,
    requests,
    inputTokens,
    outputTokens,
    totalTokens,
    durationMs,
    capturedToolCalls,
    actualResponse: responseText,
    failures,
    warnings,
  };
}
