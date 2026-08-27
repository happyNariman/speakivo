import type { EvalReport, EvalCaseResult } from "./types.js";

// ANSI color codes
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const GRAY = "\x1b[90m";

/**
 * Prints individual case progress line during eval run.
 */
export function formatCaseProgress(result: EvalCaseResult): string {
  const icon = result.passed ? `${GREEN}✔ PASS${RESET}` : `${RED}✖ FAIL${RESET}`;
  const duration = `${GRAY}(${result.durationMs}ms)${RESET}`;
  const toolCount = `${GRAY}[${result.capturedToolCalls.length} tool calls, ${result.totalTokens} tokens]${RESET}`;

  return `  ${icon} ${BOLD}${result.caseId}${RESET} - ${result.caseName} ${duration} ${toolCount}`;
}

/**
 * Formats full summary evaluation report.
 */
export function formatEvalReport(report: EvalReport, categoryFilter?: string): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(`${BOLD}${CYAN}================================================================${RESET}`);
  lines.push(`${BOLD}${CYAN}                   Speakivo Agent Evaluations                   ${RESET}`);
  lines.push(`${BOLD}${CYAN}================================================================${RESET}`);
  lines.push("");

  lines.push(`${BOLD}Dataset:${RESET} ${categoryFilter ?? "all"}`);
  lines.push(`${BOLD}Total Cases:${RESET} ${report.totalCases}`);
  lines.push(
    `${BOLD}Passed:${RESET} ${GREEN}${report.passedCases}${RESET} | ${BOLD}Failed:${RESET} ${
      report.failedCases > 0 ? `${RED}${report.failedCases}${RESET}` : "0"
    } | ${BOLD}Pass Rate:${RESET} ${
      report.overallPassRate >= 90
        ? `${GREEN}${report.overallPassRate.toFixed(1)}%${RESET}`
        : `${YELLOW}${report.overallPassRate.toFixed(1)}%${RESET}`
    }`,
  );
  lines.push(`${BOLD}Total Duration:${RESET} ${(report.totalDurationMs / 1000).toFixed(2)}s`);
  lines.push("");

  // Category Breakdown Table
  lines.push(`${BOLD}Category Breakdown:${RESET}`);
  lines.push(
    `  ${"Category".padEnd(18)} ${"Pass/Total".padEnd(12)} ${"Pass %".padEnd(9)} ${"Tool Acc".padEnd(9)} ${"Side-Eff".padEnd(9)} ${"Mut Prec".padEnd(9)} ${"Avg Tok"}`,
  );
  lines.push(`  ${"------------------".padEnd(18)} ${"----------".padEnd(12)} ${"------".padEnd(9)} ${"--------".padEnd(9)} ${"--------".padEnd(9)} ${"--------".padEnd(9)} ${"-------"}`);

  for (const cat of report.categoryMetrics) {
    const passColor = cat.failedCases === 0 ? GREEN : RED;
    const catPassStr = `${passColor}${cat.passedCases}/${cat.totalCases}${RESET}`.padEnd(12 + passColor.length + RESET.length);
    const catRateStr = `${cat.passRate.toFixed(1)}%`.padEnd(9);
    const toolAccStr = `${cat.toolAccuracy.toFixed(1)}%`.padEnd(9);
    const sideAccStr = `${cat.sideEffectAccuracy.toFixed(1)}%`.padEnd(9);
    const mutPrecStr = `${cat.mutationPrecision.toFixed(1)}%`.padEnd(9);
    const avgTokStr = `${Math.round(cat.avgTotalTokens)}`;

    lines.push(
      `  ${cat.category.padEnd(18)} ${catPassStr} ${catRateStr} ${toolAccStr} ${sideAccStr} ${mutPrecStr} ${avgTokStr}`,
    );
  }

  lines.push("");

  // Quality & Accuracy Metrics
  lines.push(`${BOLD}Accuracy & Precision Metrics:${RESET}`);
  lines.push(`  • Tool-call accuracy:         ${report.overallToolAccuracy.toFixed(1)}%`);
  lines.push(`  • Argument accuracy:          ${report.overallArgumentAccuracy.toFixed(1)}%`);
  lines.push(`  • Side-effect accuracy:       ${report.overallSideEffectAccuracy.toFixed(1)}%`);
  lines.push(`  • Security pass rate:         ${report.overallSecurityPassRate.toFixed(1)}%`);
  lines.push(`  • Mutation precision:         ${report.overallMutationPrecision.toFixed(1)}%`);
  lines.push(`  • Unnecessary-write rate:     ${report.overallUnnecessaryWriteRate.toFixed(1)}%`);
  lines.push("");

  // Continuation & Engagement Metrics
  lines.push(`${BOLD}Continuation & Engagement Metrics:${RESET}`);
  lines.push(
    `  • Continuation accuracy:      ${report.overallContinuationAccuracy.toFixed(1)}% (${report.correctContinuations}/${report.expectedContinuationCases} continuations, ${report.correctCompletions}/${report.expectedCompletionCases} sign-offs)`,
  );
  lines.push(
    `  • Forced continuation rate:   ${report.overallForcedContinuationRate.toFixed(1)}% (${report.forcedContinuationCases} unexpected forced questions)`,
  );
  lines.push("");

  // Efficiency Metrics
  lines.push(`${BOLD}Efficiency Metrics (Averages per Case):${RESET}`);
  lines.push(`  • Average requests:       ${report.avgRequests.toFixed(1)}`);
  lines.push(`  • Average input tokens:   ${Math.round(report.avgInputTokens).toLocaleString()}`);
  lines.push(`  • Average output tokens:  ${Math.round(report.avgOutputTokens).toLocaleString()}`);
  lines.push(`  • Average total tokens:   ${Math.round(report.avgTotalTokens).toLocaleString()}`);
  lines.push("");

  // Failure Diagnostics
  if (report.failedCases > 0) {
    lines.push(`${BOLD}${RED}Failed Cases Diagnostics:${RESET}`);
    lines.push(`${RED}----------------------------------------------------------------${RESET}`);

    for (const res of report.results) {
      if (!res.passed) {
        lines.push(`\n${BOLD}${RED}✖ FAIL: ${res.caseId}${RESET} (${res.caseName})`);
        lines.push(`  ${BOLD}Category:${RESET} ${res.category}`);
        lines.push(
          `  ${BOLD}Executed Tool Calls (${res.capturedToolCalls.length}):${RESET} ${
            res.capturedToolCalls.length > 0
              ? res.capturedToolCalls.map((t) => t.name).join(", ")
              : "none"
          }`,
        );

        if (res.capturedToolCalls.length > 0) {
          lines.push(`  ${BOLD}Tool Call Details:${RESET}`);
          for (const tc of res.capturedToolCalls) {
            lines.push(`    • ${tc.name}(${JSON.stringify(tc.arguments)})`);
          }
        }

        if (res.actualResponse) {
          lines.push(`  ${BOLD}Agent Response:${RESET} "${res.actualResponse.replace(/\n/g, " ").slice(0, 150)}..."`);
        }

        lines.push(`  ${BOLD}Failure Reasons:${RESET}`);
        for (const failure of res.failures) {
          lines.push(`    ${RED}• ${failure}${RESET}`);
        }
      }
    }

    lines.push(`${RED}----------------------------------------------------------------${RESET}`);
    lines.push("");
  } else {
    lines.push(`${BOLD}${GREEN}✔ All evaluation cases passed successfully!${RESET}`);
    lines.push("");
  }

  return lines.join("\n");
}
