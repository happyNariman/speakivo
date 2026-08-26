import { z } from "zod/v4";

// Automatically load .env file in Node 20+ when running via node instead of tsx
try {
  process.loadEnvFile();
} catch {
  // Ignore if .env is missing (e.g., in Docker or CI where env vars are already set)
}

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  ADMIN_TELEGRAM_ID: z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
    z.coerce.number().int().positive().optional(),
  ),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_MODEL: z.string().default("gpt-5.6-luna"),
  OPENAI_TRANSCRIPTION_MODEL: z.string().default("whisper-1"),

  // Database
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required"),

  // Voice & TTS Settings
  VOICE_REPLY_ENABLED: z
    .string()
    .default("true")
    .transform((val) => val === "true"),
  DEFAULT_VOICE_REPLY_TO_VOICE_MESSAGE: z
    .string()
    .default("true")
    .transform((val) => val === "true"),
  OPENAI_TTS_MODEL: z.string().default("gpt-4o-mini-tts"),
  OPENAI_TTS_VOICE: z.string().default("marin"),
  OPENAI_TTS_INSTRUCTIONS: z
    .string()
    .default(
      "Speak naturally, warmly, and clearly at a moderate pace suitable for a language learner.",
    ),

  // AI Context Management
  AI_SHORT_CONTEXT_ENABLED: z
    .string()
    .default("true")
    .transform((val) => val === "true"),
  AI_SHORT_CONTEXT_MAX_INPUT_TOKENS: z.coerce
    .number()
    .int()
    .positive("AI_SHORT_CONTEXT_MAX_INPUT_TOKENS must be a positive integer")
    .default(272000),
  AI_SHORT_CONTEXT_SAFETY_MARGIN_TOKENS: z.coerce
    .number()
    .int()
    .min(0, "AI_SHORT_CONTEXT_SAFETY_MARGIN_TOKENS must be non-negative")
    .default(5000),
  AI_SHORT_CONTEXT_STRATEGY: z
    .enum(["truncate_oldest"])
    .default("truncate_oldest"),

  // Language Level Assessment
  LANGUAGE_LEVEL_ASSESSMENT_ENABLED: z
    .string()
    .default("true")
    .transform((val) => val === "true"),
  LANGUAGE_LEVEL_MIN_CONFIDENCE: z.coerce
    .number()
    .min(0)
    .max(1)
    .default(0.75),
  LANGUAGE_LEVEL_MIN_EVIDENCE: z.coerce
    .number()
    .int()
    .min(1)
    .default(5),
});

function validateEnv(): z.infer<typeof envSchema> {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = z.prettifyError(result.error);
    console.error("❌ Invalid environment variables:\n", formatted);
    process.exit(1);
  }

  return result.data;
}

export const env = validateEnv();
