import { EvalRunner } from "./runner.js";
import { formatCaseProgress, formatEvalReport } from "./report.js";

function parseCliArgs(): {
  category?: string;
  caseId?: string;
} {
  const args = process.argv.slice(2);
  const options: { category?: string; caseId?: string } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--category" && args[i + 1]) {
      options.category = args[i + 1];
      i++;
    } else if (args[i] === "--case" && args[i + 1]) {
      options.caseId = args[i + 1];
      i++;
    }
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseCliArgs();
  const runner = new EvalRunner();

  console.log("\n🚀 Starting Speakivo Agent Evaluation Suite...");
  if (options.category) {
    console.log(`🎯 Category filter: ${options.category}`);
  }
  if (options.caseId) {
    console.log(`🎯 Case filter: ${options.caseId}`);
  }
  console.log("");

  const report = await runner.runAll({
    category: options.category,
    caseId: options.caseId,
    onCaseComplete: (caseResult) => {
      console.log(formatCaseProgress(caseResult));
    },
  });

  const formattedReport = formatEvalReport(report, options.category);
  console.log(formattedReport);

  // Exit with non-zero code if any case failed (CI-friendly)
  if (report.failedCases > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("❌ Fatal evaluation error:", err);
  process.exit(1);
});
