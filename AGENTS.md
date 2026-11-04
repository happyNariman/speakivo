# AGENTS.md

Guidance for AI agents working in this repository. See `README.md` for product docs.

## What this is

Speakivo — a Telegram AI language-learning bot (text + voice).

- Runtime: Node.js 22+, TypeScript (ESM, `"type": "module"`), run with `tsx`
- Telegram: GramIO
- AI: OpenAI Agents SDK (`@openai/agents`), OpenAI STT/TTS
- DB: PostgreSQL + Drizzle ORM (`postgres` driver), migrations in `drizzle/`
- Validation: Zod (`src/config/env.ts` validates env at import time)
- Tests: Node built-in test runner via `tsx --test`

## Repo layout

- `src/main.ts` — entrypoint
- `src/bot/` — GramIO bot setup and handlers (`handlers/message.ts`, `status.ts`)
- `src/agent/` — language-tutor agent: instructions, tools, agent factory
- `src/services/` — business logic (message processing, conversation, learning, assessment, usage, users)
- `src/ai/context/` — token counting and input-context budget/truncation
- `src/audio/` — speech-to-text / text-to-speech services and markdown normalizer
- `src/db/` — Drizzle client, `schema/`, `migrate.ts`, `seed.ts`
- `src/config/env.ts` — env schema
- `drizzle/` — generated SQL migrations (do not edit by hand; use `npm run db:generate`)
- `evals/` — agent evaluation suite (`cli.ts`, `runner.ts`, `datasets/*.json`, `evaluators/`)
- `.github/workflows/deploy.yml` — CI (typecheck + build) and deploy on `main`
- `.agents/skills/` — vendored third-party agent skills; don't modify

Tests are colocated: `src/**/*.test.ts`.

## Commands

```bash
npm ci                 # install (use instead of npm install; lockfile is authoritative)
npm run typecheck      # tsc --noEmit
npm run build          # tsc -> dist/
npm test               # tsx --test 'src/**/*.test.ts'
npm run eval           # full agent eval suite (see below)
npm run eval:<category>  # conversation | grammar | vocabulary | learning-state |
                         # level-assessment | security | context-budget | voice | continuation
npm run dev            # tsx watch src/main.ts (needs a real Telegram token)
npm run db:generate    # generate a migration after editing src/db/schema
npm run db:migrate     # apply migrations
npm run db:seed        # seed languages and grammar topics
```

CI runs only `npm ci`, `npm run typecheck`, `npm run build`. Run all three before opening a PR; run tests when you touch code under `src/`.

## Running tests locally

Tests and evals hit a real PostgreSQL database. Use the local dev Postgres:

```bash
pg-dev start                                   # 127.0.0.1:5432, user postgres, trust auth
psql -h 127.0.0.1 -U postgres -c 'CREATE DATABASE speakivo_<task>'   # per-task DB for isolation

export DATABASE_URL=postgresql://postgres@127.0.0.1:5432/speakivo_<task>
export TELEGRAM_BOT_TOKEN=dummy
export OPENAI_API_KEY=dummy      # see warning below

npm run db:migrate
npm run db:seed
npm test
```

All three env vars are required at import time (`src/config/env.ts`), even for tests that never use them; dummy values are fine for those.

**Warning — real OpenAI calls:** 5 tests in `src/services/message-processing.test.ts` call the real OpenAI API through the agent (the STT/TTS services are mocked, the agent is not). With a dummy `OPENAI_API_KEY` those 5 fail (auth error); with a real key they cost money. Treat those failures as expected when no real key is available, and report them explicitly rather than hiding them. Likewise `npm run eval` calls OpenAI and needs a real key.

Never commit `.env`; copy `.env.example` if you need one locally.

## Conventions

- Conventional commits: `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`
- Code, comments, commits, PR titles/descriptions in English
- Never commit or print secrets (tokens, API keys, `.env`)
- Never push to `main`; work on a branch and open a PR
- Keep changes minimal and focused; add or update tests for behaviour you change
- Schema changes: edit `src/db/schema/*`, run `npm run db:generate`, commit the generated SQL and `drizzle/meta`
- Use ESM-style imports with `.js` extensions for relative paths (as in existing code)
