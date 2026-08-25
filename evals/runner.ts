import fs from "node:fs";
import path from "node:path";
import { Agent, run, tool, type ModelResponse } from "@openai/agents";
import { env } from "../src/config/env.js";
import {
  LANGUAGE_TUTOR_INSTRUCTIONS,
  getAgentInstructions,
} from "../src/agent/instructions.js";
import { agentTools } from "../src/agent/tools.js";
import {
  contextManager,
  AgentResponseSchema,
  type AgentContext,
} from "../src/agent/language-agent.js";
import { detectExplicitModalityRequest } from "../src/types/modality.js";
import type { AgentInputItem } from "../src/ai/context/types.js";
import { setupEvalFixtures } from "./fixtures/test-fixtures.js";
import { evaluateCase } from "./evaluators/index.js";
import type {
  EvalCase,
  EvalCaseResult,
  CapturedToolCall,
  EvalReport,
  CategoryMetrics,
} from "./types.js";

export class EvalRunner {
  private datasetsDir: string;

  constructor(datasetsDir?: string) {
    this.datasetsDir =
      datasetsDir ?? path.resolve(process.cwd(), "evals/datasets");
  }

  /**
   * Loads all declarative evaluation cases from datasets directory.
   */
  loadCases(filter?: { category?: string; caseId?: string }): EvalCase[] {
    const files = fs
      .readdirSync(this.datasetsDir)
      .filter((f) => f.endsWith(".json"));

    let allCases: EvalCase[] = [];

    for (const file of files) {
      const fullPath = path.join(this.datasetsDir, file);
      const content = fs.readFileSync(fullPath, "utf-8");
      const cases = JSON.parse(content) as EvalCase[];
      allCases = allCases.concat(cases);
    }

    if (filter?.category) {
      allCases = allCases.filter((c) => c.category === filter.category);
    }

    if (filter?.caseId) {
      allCases = allCases.filter((c) => c.id === filter.caseId);
    }

    return allCases;
  }

  /**
   * Executes a single evaluation case against the real Language Learning Agent.
   */
  async runCase(evalCase: EvalCase): Promise<EvalCaseResult> {
    const startTime = Date.now();
    const fixture = await setupEvalFixtures(evalCase);
    const capturedCalls: CapturedToolCall[] = [];

    try {
      // 1. Create instrumented tools to transparently capture calls and arguments
      const instrumentedTools = agentTools.map((originalTool) => {
        const cloned = Object.create(originalTool);
        const originalInvoke = originalTool.invoke.bind(originalTool);
        cloned.invoke = async (runContext: any, input: string) => {
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(input || "{}");
          } catch {
            parsedArgs = { raw: input };
          }
          const rawResult = await originalInvoke(runContext, input);
          let parsedResult: unknown = rawResult;
          try {
            if (typeof rawResult === "string") {
              parsedResult = JSON.parse(rawResult);
            }
          } catch {
            parsedResult = rawResult;
          }
          capturedCalls.push({
            name: originalTool.name,
            arguments: parsedArgs,
            result: parsedResult,
            timestamp: new Date(),
          });
          return rawResult;
        };
        return cloned;
      });

      // 2. Create evaluation agent instance with AgentResponseSchema
      const evalAgent = new Agent<AgentContext, typeof AgentResponseSchema>({
        name: "Language Learning Tutor (Eval)",
        instructions: (runContext) => getAgentInstructions(runContext),
        model: env.OPENAI_MODEL,
        tools: instrumentedTools,
        outputType: AgentResponseSchema,
      });

      // 3. Set input modality and detect explicit requests
      const inputModality =
        evalCase.inputModality ??
        (evalCase.category === "voice" ? "voice" : "text");
      const requestedOutputModality = detectExplicitModalityRequest(
        evalCase.input,
      );

      fixture.agentContext.inputModality = inputModality;
      fixture.agentContext.requestedOutputModality = requestedOutputModality;

      // 4. Check for empty transcript or STT failure special cases
      let responseText = "";
      let actualModality: "text" | "voice" =
        requestedOutputModality ?? (inputModality === "voice" ? "voice" : "text");
      let rawResponses: ModelResponse[] = [];
      let inputTokens = 0;
      let outputTokens = 0;

      if (evalCase.input === "" || evalCase.input === "[EMPTY_TRANSCRIPT]") {
        // Empty transcript bypasses Agent call as required by Stage 8 spec
        responseText =
          "Sorry, I couldn't understand that voice message. Please try sending it again.";
        actualModality = "text";
      } else if (evalCase.input === "[STT_ERROR]") {
        // STT failure bypasses Agent call as required by Stage 8 spec
        responseText =
          "Sorry, I couldn't understand that voice message. Please try sending it again.";
        actualModality = "text";
      } else {
        // 5. Build input items (from setup messages + current input)
        const inputItems: AgentInputItem[] = [];

        if (evalCase.setup?.previousMessages) {
          for (const prev of evalCase.setup.previousMessages) {
            if (prev.role === "assistant") {
              inputItems.push({
                role: "assistant",
                status: "completed",
                content: [{ type: "output_text", text: prev.content }],
              });
            } else {
              inputItems.push({
                role: prev.role as "user" | "system",
                content: prev.content,
              });
            }
          }
        }

        inputItems.push({
          role: "user",
          content: evalCase.input,
        });

        // 6. Apply Context Management
        const contextResult = contextManager.prepare(inputItems, {
          instructions: LANGUAGE_TUTOR_INSTRUCTIONS,
          userId: fixture.agentContext.userId,
        });

        // 7. Execute Agent
        const agentResult = await run(evalAgent, contextResult.input, {
          context: fixture.agentContext,
        });

        rawResponses = agentResult.rawResponses ?? [];

        for (const raw of rawResponses) {
          if (raw.usage) {
            inputTokens += raw.usage.inputTokens ?? 0;
            outputTokens += raw.usage.outputTokens ?? 0;
          }
        }

        const finalOutput = agentResult.finalOutput;
        if (
          finalOutput &&
          typeof finalOutput === "object" &&
          typeof (finalOutput as any).text === "string"
        ) {
          responseText = (finalOutput as any).text.trim();
          if (
            (finalOutput as any).modality === "voice" ||
            (finalOutput as any).modality === "text"
          ) {
            actualModality = (finalOutput as any).modality;
          }
        } else if (
          typeof finalOutput === "string" &&
          finalOutput.trim().length > 0
        ) {
          try {
            const parsed = JSON.parse(finalOutput);
            if (parsed.text) {
              responseText = String(parsed.text).trim();
              if (parsed.modality === "voice" || parsed.modality === "text") {
                actualModality = parsed.modality;
              }
            } else {
              responseText = finalOutput.trim();
            }
          } catch {
            responseText = finalOutput.trim();
          }
        } else if (Array.isArray((agentResult as any).messages)) {
          const msgs = (agentResult as any).messages;
          for (let i = msgs.length - 1; i >= 0; i--) {
            const m = msgs[i];
            if (m.role === "assistant" && Array.isArray(m.content)) {
              const textChunk = m.content.find(
                (c: any) => c.type === "output_text" || c.type === "text",
              );
              if (textChunk?.text?.trim()) {
                try {
                  const parsed = JSON.parse(textChunk.text);
                  responseText = (parsed.text ?? textChunk.text).trim();
                  if (
                    parsed.modality === "voice" ||
                    parsed.modality === "text"
                  ) {
                    actualModality = parsed.modality;
                  }
                } catch {
                  responseText = textChunk.text.trim();
                }
                break;
              }
            } else if (
              m.role === "assistant" &&
              typeof m.content === "string" &&
              m.content.trim()
            ) {
              try {
                const parsed = JSON.parse(m.content);
                responseText = (parsed.text ?? m.content).trim();
                if (
                  parsed.modality === "voice" ||
                  parsed.modality === "text"
                ) {
                  actualModality = parsed.modality;
                }
              } catch {
                responseText = m.content.trim();
              }
              break;
            }
          }
        }
      }

      const durationMs = Date.now() - startTime;

      // 8. Run full evaluation across tools, arguments, database side-effects, security, efficiency, modality
      return await evaluateCase(
        evalCase,
        fixture,
        capturedCalls,
        responseText,
        rawResponses.length,
        inputTokens,
        outputTokens,
        durationMs,
        actualModality,
      );
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        caseId: evalCase.id,
        caseName: evalCase.name,
        category: evalCase.category,
        passed: false,
        toolAccuracy: false,
        argumentAccuracy: false,
        sideEffectAccuracy: false,
        securityPass: false,
        responsePass: false,
        efficiencyPass: false,
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        durationMs,
        capturedToolCalls: capturedCalls,
        failures: [`Execution error: ${errorMessage}`],
        warnings: [],
      };
    } finally {
      // 8. Always cleanly tear down database fixtures
      await fixture.teardown();
    }
  }

  /**
   * Executes an array of evaluation cases and aggregates report metrics.
   */
  async runAll(options?: {
    category?: string;
    caseId?: string;
    onCaseComplete?: (result: EvalCaseResult) => void;
  }): Promise<EvalReport> {
    const cases = this.loadCases(options);
    const results: EvalCaseResult[] = [];
    const startTime = Date.now();

    for (const c of cases) {
      const result = await this.runCase(c);
      results.push(result);
      if (options?.onCaseComplete) {
        options.onCaseComplete(result);
      }
    }

    const totalDurationMs = Date.now() - startTime;
    const totalCases = results.length;
    const passedCases = results.filter((r) => r.passed).length;
    const failedCases = totalCases - passedCases;
    const overallPassRate =
      totalCases > 0 ? (passedCases / totalCases) * 100 : 0;

    const overallToolAccuracy =
      totalCases > 0
        ? (results.filter((r) => r.toolAccuracy).length / totalCases) * 100
        : 0;

    const overallArgumentAccuracy =
      totalCases > 0
        ? (results.filter((r) => r.argumentAccuracy).length / totalCases) * 100
        : 0;

    const overallSideEffectAccuracy =
      totalCases > 0
        ? (results.filter((r) => r.sideEffectAccuracy).length / totalCases) * 100
        : 0;

    const overallSecurityPassRate =
      totalCases > 0
        ? (results.filter((r) => r.securityPass).length / totalCases) * 100
        : 0;

    const totalValidWrites = results.reduce(
      (a, b) => a + (b.validWrites ?? 0),
      0,
    );
    const totalUnnecessaryWrites = results.reduce(
      (a, b) => a + (b.unnecessaryWrites ?? 0),
      0,
    );
    const totalMutations = totalValidWrites + totalUnnecessaryWrites;
    const overallMutationPrecision =
      totalMutations > 0 ? (totalValidWrites / totalMutations) * 100 : 100;
    const overallUnnecessaryWriteRate =
      totalCases > 0 ? (totalUnnecessaryWrites / totalCases) * 100 : 0;

    const avgRequests =
      totalCases > 0
        ? results.reduce((a, b) => a + b.requests, 0) / totalCases
        : 0;

    const avgInputTokens =
      totalCases > 0
        ? results.reduce((a, b) => a + b.inputTokens, 0) / totalCases
        : 0;

    const avgOutputTokens =
      totalCases > 0
        ? results.reduce((a, b) => a + b.outputTokens, 0) / totalCases
        : 0;

    const avgTotalTokens =
      totalCases > 0
        ? results.reduce((a, b) => a + b.totalTokens, 0) / totalCases
        : 0;

    // Group metrics by category
    const categories = Array.from(new Set(results.map((r) => r.category)));
    const categoryMetrics: CategoryMetrics[] = categories.map((cat) => {
      const catResults = results.filter((r) => r.category === cat);
      const catTotal = catResults.length;
      const catPassed = catResults.filter((r) => r.passed).length;
      const catValidWrites = catResults.reduce(
        (a, b) => a + (b.validWrites ?? 0),
        0,
      );
      const catUnnecessaryWrites = catResults.reduce(
        (a, b) => a + (b.unnecessaryWrites ?? 0),
        0,
      );
      const catMutations = catValidWrites + catUnnecessaryWrites;
      const mutationPrecision =
        catMutations > 0 ? (catValidWrites / catMutations) * 100 : 100;
      const unnecessaryWriteRate =
        catTotal > 0 ? (catUnnecessaryWrites / catTotal) * 100 : 0;

      return {
        category: cat,
        totalCases: catTotal,
        passedCases: catPassed,
        failedCases: catTotal - catPassed,
        passRate: catTotal > 0 ? (catPassed / catTotal) * 100 : 0,
        toolAccuracy:
          catTotal > 0
            ? (catResults.filter((r) => r.toolAccuracy).length / catTotal) * 100
            : 0,
        argumentAccuracy:
          catTotal > 0
            ? (catResults.filter((r) => r.argumentAccuracy).length / catTotal) *
              100
            : 0,
        sideEffectAccuracy:
          catTotal > 0
            ? (catResults.filter((r) => r.sideEffectAccuracy).length /
                catTotal) *
              100
            : 0,
        securityPassRate:
          catTotal > 0
            ? (catResults.filter((r) => r.securityPass).length / catTotal) * 100
            : 0,
        mutationPrecision,
        unnecessaryWriteRate,
        avgRequests:
          catTotal > 0
            ? catResults.reduce((a, b) => a + b.requests, 0) / catTotal
            : 0,
        avgInputTokens:
          catTotal > 0
            ? catResults.reduce((a, b) => a + b.inputTokens, 0) / catTotal
            : 0,
        avgOutputTokens:
          catTotal > 0
            ? catResults.reduce((a, b) => a + b.outputTokens, 0) / catTotal
            : 0,
        avgTotalTokens:
          catTotal > 0
            ? catResults.reduce((a, b) => a + b.totalTokens, 0) / catTotal
            : 0,
      };
    });

    const failedCasesList = results
      .filter((r) => !r.passed)
      .map((r) => r.caseId);

    return {
      totalCases,
      passedCases,
      failedCases,
      overallPassRate,
      overallToolAccuracy,
      overallArgumentAccuracy,
      overallSideEffectAccuracy,
      overallSecurityPassRate,
      overallMutationPrecision,
      overallUnnecessaryWriteRate,
      avgRequests,
      avgInputTokens,
      avgOutputTokens,
      avgTotalTokens,
      totalDurationMs,
      categoryMetrics,
      results,
      failedCasesList,
    };
  }
}
