# 🌍 Speakivo — AI Language Learning Companion

Speakivo is an intelligent, conversational Telegram bot that helps you practice and learn any language through natural dialogue. Powered by the **OpenAI Agents SDK** and **GramIO**, Speakivo adapts to your learning pace, explains grammar, corrects mistakes, and introduces vocabulary in real-time.

---

## ✨ Features

- 🌐 **Learn Any Language** — Practice German, Spanish, French, Japanese, English, or any language you choose without rigid presets.
- 🤖 **Conversational AI Tutor** — Engaging dialogues, polite error corrections, concise grammar explanations, and context-aware follow-up questions.
- ⚡ **Smart Token & Context Management** — Built-in BPE token counter (`o200k_base` / `cl100k_base`) ensures requests stay within configured limits and eliminates context overflows.
- 🛡️ **Type-Safe & Robust** — Built with TypeScript, GramIO, and strict Zod runtime configuration validation.
- 🐳 **Containerized** — Multi-stage Docker build ready for instant local testing or production deployment.

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
```

### 4. Run the Bot

**Using npm:**

```bash
# Install dependencies
npm install

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
| `OPENAI_MODEL`                          | `string`  | `gpt-5.6-luna`    | Model identifier (e.g., `gpt-5.6-luna`, `gpt-4o`, `gpt-4o-mini`) |
| `AI_SHORT_CONTEXT_ENABLED`              | `boolean` | `true`            | Enable/disable input token budget enforcement                    |
| `AI_SHORT_CONTEXT_MAX_INPUT_TOKENS`     | `number`  | `272000`          | Maximum allowed input tokens                                     |
| `AI_SHORT_CONTEXT_SAFETY_MARGIN_TOKENS` | `number`  | `5000`            | Safety margin subtracted from max tokens                         |
| `AI_SHORT_CONTEXT_STRATEGY`             | `string`  | `truncate_oldest` | Context reduction strategy when exceeding budget                 |

---

## 🏗️ Architecture

```text
Telegram User
      ↓
  GramIO (Long Polling)
      ↓
  Bot Handlers (src/bot/)
      ↓
  Agent Runner (src/agent/)
      ↓
┌────────────────────────────────────────────────────────┐
│ Context Manager (src/ai/context/)                      │
│ • BPE Token Counting (js-tiktoken)                     │
│ • Budget Check (maxTokens - safetyMargin)              │
│ • Truncate Oldest Strategy (preserves user prompt)     │
│ • Observability & Metrics Logging                      │
└────────────────────────────────────────────────────────┘
      ↓ (Prepared Context)
  OpenAI Agents SDK (@openai/agents)
      ↓
  Language Learning Tutor Agent
      ↓
  GramIO → Telegram User
```

---

## 📁 Project Structure

```text
src/
├── agent/
│   ├── instructions.ts          # Agent system prompt & personality
│   └── language-agent.ts        # Agent definition & execution runner
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
│       └── message.ts           # Telegram message routing
├── config/
│   └── env.ts                   # Strongly-typed Zod environment configuration
└── main.ts                      # Application entry point
```

---

## 🛠️ Development & Testing

```bash
# Run unit tests
npm test

# Run TypeScript type check
npm run typecheck

# Build for production
npm run build
```

---

## 📄 License

See `LICENSE` for details.
