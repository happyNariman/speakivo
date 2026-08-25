# 🌍 Speakivo — AI Language Learning Companion

Speakivo is an intelligent, conversational Telegram bot that helps you practice and learn any language through natural dialogue — both in **text** and **voice**. Powered by the **OpenAI Agents SDK**, **OpenAI Speech-to-Text**, **GramIO**, and **PostgreSQL with Drizzle ORM**, Speakivo adapts to your learning pace, explains grammar, corrects mistakes, tracks vocabulary progress, and remembers your learning history.

---

## ✨ Features

- 🌐 **Learn Any Language** — Practice German, Spanish, French, Japanese, English, or any language you choose without rigid presets.
- 🎙️ **Voice & Text Input** — Send typed text or record Telegram voice messages; speech is accurately transcribed via OpenAI Speech-to-Text and seamlessly processed by the same AI Tutor.
- 🤖 **Conversational AI Tutor** — Engaging dialogues, polite error corrections, concise grammar explanations, and context-aware follow-up questions.
- 🛠️ **Agentic Learning Tools** — Built-in AI tools for retrieving user profile, analyzing weak topics, reviewing vocabulary, updating practice stats, and recording learning mistakes.
- 📈 **Dynamic CEFR Level Assessment** — Multi-dimensional diagnostic evaluation, confidence scoring, evidence collection, and atomic confirmation to keep learner proficiency up-to-date.
- 🧪 **Agent Evaluation Framework (Evals)** — Local, deterministic test suite (54 test cases across 8 categories) measuring tool selection, argument accuracy, database side effects, mutation precision, security invariants, and token efficiency.
- 💾 **Persistent Learning & Sessions** — PostgreSQL database powered by Drizzle ORM storing users, language levels, topics, vocabulary, mistake history, chat sessions, and voice metadata.
- 📊 **Granular AI Usage Tracking** — Dedicated analytics layer recording per-request LLM and STT operations (tokens, modalities, model, run correlation) independently from conversation messages.
- ⚡ **Smart Token & Context Management** — BPE token counter (`o200k_base` / `cl100k_base`) ensures requests stay within configured limits and eliminates context overflows.
- 🛡️ **Type-Safe & Robust** — Built with TypeScript, GramIO, Drizzle ORM, and strict Zod runtime configuration validation.
- 🐳 **Containerized** — Multi-stage Docker build with PostgreSQL service ready for instant local testing or production deployment.

---

## 🚀 Quick Start

### 1. Prerequisites

- **Node.js** 22+ (tested on Node.js 24)
- **npm**
- (Optional) **Docker & Docker Compose**

### 2. Create a Telegram Bot

1. Open [@BotFather](https://t.me/BotFather) on Telegram.
2. Send `/newbot` and follow the instructions.
3. Save the generated **Bot Token**.

### 3. Configure Environment

Clone the repository and create your `.env` file:

```bash
cp .env.example .env
```

Set your credentials in `.env`:

```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
OPENAI_API_KEY=your_openai_api_key
DATABASE_URL=your_postgres_connection_string
```

### 4. Database Setup (Migrations & Seed)

```bash
# Apply migrations to database
npm run db:migrate

# Seed initial languages and grammar topics
npm run db:seed
```

### 5. Run the Bot

**Using npm:**

```bash
# Start in development mode (hot reload)
npm run dev

# Or build and run in production mode
npm run build
npm start
```

**Using Docker Compose:**

```bash
docker compose up --build
```

---

## 🎙️ Voice & Audio Pipeline (Speech-to-Text)

Speakivo supports Telegram voice messages as a first-class input modality. Voice messages converge into the same Language Learning Agent pipeline as text messages:

```text
                          Telegram Voice Message
                                    │
                                    ▼
                         GramIO context.download()
                                    │ (in-memory audio buffer)
                                    ▼
                       OpenAISpeechToTextService
                     (audio.transcriptions.create)
                                    │
                         ┌──────────┴──────────┐
                         ▼                     ▼
                  Empty Transcript?       Valid Transcript
                         │                     │
                         ▼                     ▼
                 Retry Response         MessageProcessingService
               (no Agent execution)            │
                                       ┌───────┴───────┐
                                       ▼               ▼
                                ai_usage (STT)    conversation_messages
                               (audio -> text)     (type = 'voice')
                                                       │
                                                       ▼
                                                ContextManager
                                                       │
                                                       ▼
                                             LanguageLearningAgent
                                                       │
                                               ┌───────┴───────┐
                                               ▼               ▼
                                         Learning Tools   ai_usage (Agent)
                                               │
                                               ▼
                                         Text Response
                                               │
                                               ▼
                                            Telegram
```

### Voice Pipeline Highlights:
- **Zero Disk I/O & Memory-Only**: Audio streams are loaded directly into memory via GramIO's `context.download()` and passed to OpenAI via `toFile()`. No temporary audio files are created on disk.
- **Privacy-First Database Persistence**: Raw audio binary data is **never stored** in PostgreSQL. Only the validated transcript and metadata (`telegramFileId`, `durationSeconds`, `mimeType`) are saved to `conversation_messages`.
- **Language Hints**: Active user learning language (`AgentContext.languageCode`) is automatically passed as a hint to the transcription model (`whisper-1` / `gpt-transcribe`), significantly improving accuracy on accented speech.
- **Dual AI Usage Tracking**: Voice interactions record two distinct analytics entries in `ai_usage`:
  1. `speech_to_text` (modality: `audio` $\to$ `text`).
  2. `agent_response` (modality: `text` $\to$ `text`).

---

## 🧪 Agent Evaluation Framework (Evals)

Speakivo features a dedicated local evaluation system (`evals/`) designed to measure AI Agent quality, verify tool behavior, test database side effects, and prevent prompt regressions across **54 declarative scenarios** across 8 categories without relying on an LLM-as-a-judge.

### Why Evals?

1. **Safe Prompt Iteration** — Modify instructions and instantly verify that the Agent still calls required learning tools on errors while avoiding unnecessary writes on chit-chat.
2. **Mutation Precision & Unnecessary-Write Metrics** — Tracks whether state-changing tools (`record_learning_mistake`, `save_vocabulary`, `update_topic_progress`, etc.) are called with valid learning justification vs. spurious triggers.
3. **Database Side-Effect Verification** — Asserts that actual PostgreSQL rows (`learning_mistakes`, `user_vocabulary`, `user_topic_progress`, `user_languages`) are inserted or updated correctly.
4. **Security & Prompt Injection Testing** — Continuously asserts that unauthorized level updates, cross-user operations, and prompt injection attempts are blocked.
5. **Token & Efficiency Monitoring** — Measures request count and token consumption per scenario to prevent tool overuse.
6. **Zero Production Impact** — Each evaluation case executes with an isolated, ephemeral test user and self-cleans immediately upon completion.

### Evaluation Datasets

```text
evals/datasets/
├── conversation.json        # 6 cases: casual chit-chat (asserts NO write tools are called)
├── grammar.json             # 11 cases: tenses, 3rd person -s, irregulars, prepositions, quotes vs real errors
├── vocabulary.json          # 9 cases: definitions, saving vocabulary, practice, false friends, known words
├── learning-state.json      # 7 cases: profile queries, progress stats, weak topics, practice updates
├── level-assessment.json    # 6 cases: diagnostic testing, proposals, atomic confirmations, ambiguities
├── security.json            # 7 cases: cross-user isolation, prompt injection, unauthorized claims
├── context-budget.json      # 3 cases: multi-turn efficiency, medium text, context budget limits
└── voice.json               # 5 cases: voice conversational flow, grammar in voice, empty transcript, STT error
```

### Running Evaluations

```bash
# Run all 54 evaluation cases across all 8 categories
npm run eval

# Run category-specific evaluation suites
npm run eval:voice
npm run eval:grammar
npm run eval:vocabulary
npm run eval:conversation
npm run eval:learning-state
npm run eval:level-assessment
npm run eval:security
npm run eval:context-budget

# Filter by a specific case ID
npm run eval -- --case voice-grammar-001
```

---

## 💬 Example Conversation

```text
User: 🎤 [Voice Message: "Yesterday I go to the cinema with my friends."]

Bot:  A small correction: **“Yesterday, I went to the cinema with my friends.”** 🎬

      Because **yesterday** refers to a finished past action, use the past tense of *go*: **went**.

      What movie did you watch?
```

---

## ⚙️ Configuration

All configuration is managed through environment variables and validated at startup via Zod:

| Variable                                | Type      | Default           | Description                                                        |
| --------------------------------------- | --------- | ----------------- | ------------------------------------------------------------------ |
| `TELEGRAM_BOT_TOKEN`                    | `string`  | _required_        | Telegram Bot token from @BotFather                                 |
| `OPENAI_API_KEY`                        | `string`  | _required_        | OpenAI API key                                                     |
| `DATABASE_URL`                          | `string`  | _required_        | PostgreSQL connection string                                       |
| `OPENAI_MODEL`                          | `string`  | `gpt-5.6-luna`    | Chat model identifier (e.g., `gpt-5.6-luna`, `gpt-4o`, `gpt-4o-mini`) |
| `OPENAI_TRANSCRIPTION_MODEL`            | `string`  | `whisper-1`        | Speech-to-Text model (e.g., `whisper-1`, `gpt-transcribe`)          |
| `AI_SHORT_CONTEXT_ENABLED`              | `boolean` | `true`            | Enable/disable input token budget enforcement                      |
| `AI_SHORT_CONTEXT_MAX_INPUT_TOKENS`     | `number`  | `272000`          | Maximum allowed input tokens                                       |
| `AI_SHORT_CONTEXT_SAFETY_MARGIN_TOKENS` | `number`  | `5000`            | Safety margin subtracted from max tokens                           |
| `AI_SHORT_CONTEXT_STRATEGY`             | `string`  | `truncate_oldest` | Context reduction strategy when exceeding budget                   |
| `LANGUAGE_LEVEL_ASSESSMENT_ENABLED`     | `boolean` | `true`            | Enable/disable dynamic language level assessment                   |
| `LANGUAGE_LEVEL_MIN_CONFIDENCE`         | `number`  | `0.75`            | Minimum confidence threshold for level proposals                   |
| `LANGUAGE_LEVEL_MIN_EVIDENCE`           | `number`  | `5`               | Minimum evidence items required for level proposals                |

---

## 📊 AI Usage Tracking & Analytics

Speakivo includes a dedicated, model-agnostic AI usage layer to track resource consumption per model request:

- **Separation of Concerns**: `conversation_messages` stores _what_ was communicated; `ai_usage` stores _how many tokens/resources_ were consumed.
- **Per-Request Granularity**: If a single user message triggers an STT transcription followed by multiple LLM requests, each operation is logged as a separate row in `ai_usage`, correlated by `user_id`, `session_id`, and `message_id`.
- **Pre-Request Estimate vs. Post-Request Actuals**:
  - Pre-request token counting (`ContextManager`) verifies that the prompt fits within the context budget before calling the API.
  - Post-request usage (`UsageService`) captures actual billed tokens (including cached tokens, text tokens, audio tokens) returned by the provider.
- **Multi-Modal Support**: Supports modality fields (`input_modality`, `output_modality`) and operations (`agent_response`, `speech_to_text`, `text_to_speech`, `realtime`).
- **Resilient**: Analytics recording failures are caught and logged safely without disrupting the user's conversational experience.

---

## 🗄️ Database Schema Overview

The database uses **PostgreSQL** with **Drizzle ORM**:

1. **`users`** — Internal user accounts with unique `telegram_id` mapping.
2. **`languages`** — Reference table of supported languages (`en`, `ru`, `de`, `fr`, `es`, etc.).
3. **`user_languages`** — User's enrolled language profiles with CEFR levels (`A1`-`C2`), status, and `level_source`.
4. **`learning_topics`** — Grammar, vocabulary, and pronunciation topics per language.
5. **`user_topic_progress`** — User mastery, attempts, confidence, and review scheduling per topic.
6. **`vocabulary`** — Dictionary words and phrases per language with lemmas and parts of speech.
7. **`user_vocabulary`** — User word repetitions, accuracy, and confidence metrics.
8. **`learning_mistakes`** — Log of user mistakes with explanations and linked topics/vocab.
9. **`language_level_assessments`** — Diagnostic level proposals, evidence arrays, confidence scores, and status lifecycle (`pending`, `confirmed`, `rejected`, `expired`).
10. **`learning_sessions`** — Learning sessions tracking user practice intervals.
11. **`conversation_messages`** — History of user, assistant, system, and tool messages with `message_type` (`text`, `voice`, `tool`) and JSONB `metadata`.
12. **`ai_usage`** — Per-request AI resource metrics (input/output/cached tokens, modality, model, run correlation).

---

## 📁 Project Structure

```text
speakivo/
├── evals/                       # 🧪 Agent Evaluation Framework
│   ├── datasets/                # 54 declarative test scenarios across 8 categories
│   │   ├── conversation.json
│   │   ├── grammar.json
│   │   ├── vocabulary.json
│   │   ├── learning-state.json
│   │   ├── level-assessment.json
│   │   ├── security.json
│   │   ├── context-budget.json
│   │   └── voice.json
│   ├── evaluators/              # Deterministic evaluation checkers
│   │   ├── tool-calls.ts
│   │   ├── tool-arguments.ts
│   │   ├── side-effects.ts      # Direct PostgreSQL state validator
│   │   ├── security.ts          # Authorization & prompt injection validator
│   │   ├── response.ts
│   │   ├── efficiency.ts
│   │   └── index.ts
│   ├── fixtures/
│   │   └── test-fixtures.ts     # Ephemeral test user creation & teardown
│   ├── runner.ts                # Evaluation orchestrator
│   ├── report.ts                # ANSI terminal reporting
│   ├── cli.ts                   # CLI entry point
│   └── types.ts                 # TypeScript schemas
├── src/
│   ├── agent/
│   │   ├── instructions.ts      # Agent system prompt & directives
│   │   ├── language-agent.ts    # Agent definition, runner & runId generator
│   │   └── tools.ts             # 11 database-backed Agent tools
│   ├── ai/
│   │   └── context/
│   │       ├── types.ts         # Context management interfaces & metrics
│   │       ├── token-counter.ts # BPE token counter (o200k_base / cl100k_base)
│   │       ├── context-strategy.ts # Context reduction strategies
│   │       ├── context-manager.ts  # Context manager orchestrator
│   │       └── context-manager.test.ts # Unit test suite
│   ├── audio/
│   │   ├── speech-to-text.service.ts # STT interface & DTO definitions
│   │   ├── openai-speech-to-text.service.ts # Official OpenAI audio transcriptions
│   │   └── audio.test.ts        # STT unit tests
│   ├── bot/
│   │   ├── bot.ts               # GramIO bot initialization & lifecycle
│   │   └── handlers/
│   │       └── message.ts       # Telegram message handler (text, voice routing)
│   ├── config/
│   │   └── env.ts               # Strongly-typed Zod environment configuration
│   ├── db/
│   │   ├── client.ts            # Drizzle database client (postgres.js)
│   │   ├── migrate.ts           # Migration runner
│   │   ├── seed.ts              # Deterministic database seeder
│   │   └── schema/              # 12 Drizzle database schema definitions
│   │       ├── users.ts
│   │       ├── languages.ts
│   │       ├── user-languages.ts
│   │       ├── learning-topics.ts
│   │       ├── user-topic-progress.ts
│   │       ├── vocabulary.ts
│   │       ├── user-vocabulary.ts
│   │       ├── learning-mistakes.ts
│   │       ├── language-level-assessments.ts
│   │       ├── learning-sessions.ts
│   │       ├── conversation-messages.ts
│   │       ├── ai-usage.ts
│   │       └── index.ts
│   ├── services/
│   │   ├── user-service.ts      # User finding, creation & sync
│   │   ├── learning-service.ts  # Languages, progress, mistakes & vocabulary
│   │   ├── assessment-service.ts # Dynamic CEFR level assessment & atomic confirmation
│   │   ├── conversation-service.ts # Sessions & message history
│   │   ├── usage-service.ts     # Per-request AI usage recording & analytics queries
│   │   ├── message-processing-service.ts # Unified text & voice application pipeline
│   │   ├── message-processing.test.ts # Message processing integration tests
│   │   ├── services.test.ts     # Service & database integration tests
│   │   ├── assessment-service.test.ts # Level assessment test suite
│   │   └── usage-service.test.ts # AI usage & analytics test suite
│   └── main.ts                  # Application entry point
```

---

## 🛠️ Development & Database Commands

```bash
# Run Agent Evaluations (54 cases across 8 categories)
npm run eval

# Run category-specific evaluations
npm run eval:voice
npm run eval:grammar
npm run eval:vocabulary
npm run eval:conversation
npm run eval:learning-state
npm run eval:level-assessment
npm run eval:security
npm run eval:context-budget

# Run unit & integration tests (75 tests)
npm test

# Run TypeScript type check
npm run typecheck

# Build for production
npm run build

# Generate Drizzle migrations
npm run db:generate

# Apply migrations
npm run db:migrate

# Seed database
npm run db:seed

# Open Drizzle Studio
npm run db:studio
```

---

## 📄 License

See `LICENSE` for details.
