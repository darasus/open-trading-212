# open-trading-212 — notes for agents

- Electron + electron-vite. `src/main` (Node: Trading 212 client, keychain, SQLite), `src/preload` (typed bridge), `src/renderer` (React, no Node), `src/shared` (IPC contract).
- Read-only product. `src/main/t212/api.ts` must only ever issue `GET`. Never add order, pie or export-creation endpoints.
- The renderer must never gain network or Node access. Add capabilities by extending `src/shared/ipc.ts`, the preload bridge, and a handler in `src/main/ipc.ts`.
- Secrets go through Electron `safeStorage`, never into SQLite or settings.
- Money in the account currency is integer cents (`*Cents` / `*_cents`); instrument prices and quantities are plain numbers in the instrument currency (GBX is pence).
- Trading 212 API reference: https://docs.trading212.com/api (OpenAPI at `/_spec/api.json`). Treat every response field as optional. Respect the per-endpoint rate limits in `api.ts`.
- Schema changes: edit `src/main/db/schema.ts`, run `bun run db:generate`, commit the `drizzle/` output.
- UI: shadcn/ui components in `src/renderer/src/components/ui`, AI Elements for chat.
- bun is the package manager (`bun install`, `bun.lock`). Run scripts with `bun run`: `bun run typecheck`, `bun run lint` (oxlint), `bun run format` (oxfmt) and `bun run test` before committing. Use `bun run test`, not `bun test`: tests are vitest, not the bun test runner.
- Tests are vitest, colocated as `*.test.ts` under `src/main`. They run under plain Node with `electron` aliased to `src/main/__tests__/mocks`, against a real migrated SQLite file in a temp dir. Mock `fetch` for the client; cover pure logic and SQL there, not the UI.
- The chat round trip (renderer `useChat` + IPC transport + main `ai/chat.ts`) has an integration test in `src/renderer/src/__tests__/chat-roundtrip.test.tsx`, run under happy-dom and StrictMode with a scripted model. Keep it passing when touching chat streaming: StrictMode double-runs effects, which is how the resume bug showed up.
- AI providers live in `src/main/ai/providers.ts` (factory, key, hosts, live model list per provider). Only the selected provider's host is on the allow-list; Ollama must be loopback. Add a provider there, then its hosts are allowed automatically.
- Chat threads use `useThreadChat` (`src/renderer/src/hooks/use-thread-chat.ts`), which owns the `Chat` instance: useChat stops chats it creates on unmount, which would abort the reply in main.
