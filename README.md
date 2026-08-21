# 🌍 Speakivo — AI Language Learning Companion

Speakivo is an intelligent, conversational Telegram bot that helps you practice and learn any language through natural dialogue. Powered by the **OpenAI Agents SDK**, **GramIO**, and **PostgreSQL with Drizzle ORM**, Speakivo adapts to your learning pace, explains grammar, corrects mistakes, tracks vocabulary progress, and remembers your learning history.

---

## ✨ Features

- 🌐 **Learn Any Language** — Practice German, Spanish, French, Japanese, English, or any language you choose without rigid presets.
- 🤖 **Conversational AI Tutor** — Engaging dialogues, polite error corrections, concise grammar explanations, and context-aware follow-up questions.
- 🛠️ **Agentic Learning Tools** — Built-in AI tools for retrieving user profile, analyzing weak topics, reviewing vocabulary, and recording learning mistakes.
- 💾 **Persistent Learning & Sessions** — PostgreSQL database powered by Drizzle ORM storing users, language levels, topics, vocabulary, mistake history, and chat sessions.
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

## 💬 Example Conversation

```text
User: Hi! I want to learn German.

Bot:  Great choice! German is a wonderful language. 🇩🇪
      Let's start with a simple greeting.
      "Hallo!" means "Hello!" in German.
      Can you try saying "Guten Tag" (Good day)?

User: Guten Tag! Wie geht es Ihnen?

Bot:  Sehr gut! 👏 Your phrasing is spot on.
      "Wie geht es Ihnen?" is the polite/formal way to ask "How are you?".
      For friends, you can simply say "Wie geht's?".
      Mir geht es gut, danke! (I'm doing well, thanks!)
      What topic would you like to explore next?
```

---

## ⚙️ Configuration

All configuration is managed through environment variables and validated at startup via Zod:

| Variable                                | Type      | Default           | Description                                                      |
| --------------------------------------- | --------- | ----------------- | ---------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`                    | `string`  | _required_        | Telegram Bot token from @BotFather                               |
| `OPENAI_API_KEY`                        | `string`  | _required_        | OpenAI API key                                                   |
| `DATABASE_URL`                          | `string`  | _required_        | PostgreSQL connection string                                     |
| `OPENAI_MODEL`                          | `string`  | `gpt-5.6-luna`    | Model identifier (e.g., `gpt-5.6-luna`, `gpt-4o`, `gpt-4o-mini`) |
| `AI_SHORT_CONTEXT_ENABLED`              | `boolean` | `true`            | Enable/disable input token budget enforcement                    |
| `AI_SHORT_CONTEXT_MAX_INPUT_TOKENS`     | `number`  | `272000`          | Maximum allowed input tokens                                     |
| `AI_SHORT_CONTEXT_SAFETY_MARGIN_TOKENS` | `number`  | `5000`            | Safety margin subtracted from max tokens                         |
| `AI_SHORT_CONTEXT_STRATEGY`             | `string`  | `truncate_oldest` | Context reduction strategy when exceeding budget                 |

---

## 🗄️ Database Schema Overview

The database uses **PostgreSQL** with **Drizzle ORM**:

1. **`users`** — Internal user accounts with unique `telegram_id` mapping.
2. **`languages`** — Reference table of supported languages (`en`, `ru`, `de`, `fr`, `es`, etc.).
3. **`user_languages`** — User's enrolled language profiles with CEFR levels (`A1`-`C2`) and status.
4. **`learning_topics`** — Grammar, vocabulary, and pronunciation topics per language.
5. **`user_topic_progress`** — User mastery, attempts, confidence, and review scheduling per topic.
6. **`vocabulary`** — Dictionary words and phrases per language with lemmas and parts of speech.
7. **`user_vocabulary`** — User word repetitions, accuracy, and confidence metrics.
8. **`learning_mistakes`** — Log of user mistakes with explanations and linked topics/vocab.
9. **`learning_sessions`** — Learning sessions tracking user practice intervals.
10. **`conversation_messages`** — History of user, assistant, system, and tool messages with token usage.

---

## 🏗️ Architecture

```text
                         Telegram User
                              │
                            GramIO
                              │
                      Application Layer
               (Find/Create User, Active Language)
                              │
                  ┌───────────┴───────────┐
                  ▼                       ▼
           Context Manager          User Context
          (Recent Messages)      (User & Services)
                  │                       │
                  └───────────┬───────────┘
                              ▼
                   Language Learning Agent
                              │
                         Agent Tools
             (Profile, Progress, Mistakes, Vocab)
                              │
                              ▼
                     Application Services
            (UserService, LearningService, ConversationService)
                              │
                           Drizzle
                              │
                              ▼
                         PostgreSQL
```

---

## 📁 Project Structure

```text
src/
├── agent/
│   ├── instructions.ts          # Agent system prompt & personality
│   ├── language-agent.ts        # Agent definition & execution runner
│   └── tools.ts                 # 8 database-backed Agent tools
├── ai/
│   └── context/
│       ├── types.ts             # Context management interfaces & metrics
│       ├── token-counter.ts     # BPE token counter (o200k_base / cl100k_base)
│       ├── context-strategy.ts  # Context reduction strategies
│       ├── context-manager.ts   # Context manager orchestrator
│       └── context-manager.test.ts # Unit test suite
├── bot/
│   ├── bot.ts                   # GramIO bot initialization & lifecycle
│   └── handlers/
│       └── message.ts           # Telegram message routing & persistence
├── config/
│   └── env.ts                   # Strongly-typed Zod environment configuration
├── db/
│   ├── client.ts                # Drizzle database client (postgres.js)
│   ├── migrate.ts               # Migration runner
│   ├── seed.ts                  # Deterministic database seeder
│   └── schema/                  # 10 Drizzle database schema definitions
│       ├── users.ts
│       ├── languages.ts
│       ├── user-languages.ts
│       ├── learning-topics.ts
│       ├── user-topic-progress.ts
│       ├── vocabulary.ts
│       ├── user-vocabulary.ts
│       ├── learning-mistakes.ts
│       ├── learning-sessions.ts
│       ├── conversation-messages.ts
│       └── index.ts
├── services/
│   ├── user-service.ts          # User finding, creation & sync
│   ├── learning-service.ts      # Languages, progress, mistakes & vocabulary
│   ├── conversation-service.ts  # Sessions & message history
│   └── services.test.ts         # Service & database integration tests
└── main.ts                      # Application entry point
```

---

## 🛠️ Development & Database Commands

```bash
# Run unit & integration tests
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
