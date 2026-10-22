# Contributing

Thanks for helping. Bug reports, fixes and small focused features are all welcome. For anything larger, open an issue first so we can agree on the shape before you write it.

Found a security or privacy problem? Don't open an issue or a PR. Report it privately as described in [SECURITY.md](SECURITY.md).

## What won't be merged

The [trust model](README.md#trust-model) is the product, so a few lines don't move:

- **Read-only.** `src/main/t212/api.ts` only sends `GET`. No endpoint that places, edits or cancels an order, manages pies or creates exports.
- **No new hosts.** The network allow-list in `src/main/network.ts` is Trading 212, the one AI provider the user selected, and this repository's releases. A feature that needs a new host, such as a third-party price source or analytics, is almost certainly out.
- **No network or Node in the renderer.** New capabilities go through the typed IPC contract: extend `src/shared/ipc.ts`, the preload bridge in `src/preload`, and add a handler in `src/main/ipc.ts`.
- **Secrets stay in the keychain.** Keys go through Electron `safeStorage` (`src/main/keychain.ts`), never into SQLite, settings or logs.

The README's [Out of scope](README.md#out-of-scope) section lists what else the app doesn't do.

## Setup

You need [bun](https://bun.com) and Node 22.

```bash
bun install
bun run dev
```

A Practice (demo) account's API key is the easiest way to get data to work with. In development, the chat falls back to `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` or `OPENROUTER_API_KEY` from your shell, so you don't have to paste one.

## Before you open a PR

CI runs these, and `main` only accepts changes that pass:

```bash
bun run typecheck
bun run lint
bun run format:check   # bun run format fixes it
bun run test
```

Use `bun run test`, not `bun test`: the tests are vitest, not bun's runner.

## Conventions

- **Tests** are colocated as `*.test.ts` under `src/main`. They run under plain Node against a real migrated SQLite file in a temp dir, with `electron` replaced by the stand-ins in `src/main/__tests__/mocks`. Mock `fetch` for the Trading 212 client. Cover pure logic and SQL there, not the UI.
- **Chat streaming** has an integration test in `src/renderer/src/__tests__/chat-roundtrip.test.tsx` that runs under React StrictMode. Keep it passing when you touch `useThreadChat`, the IPC transport or `src/main/ai/chat.ts`.
- **Money** in the account currency is integer cents (`*Cents`, `*_cents`). Instrument prices and quantities are plain numbers in the instrument's currency, where GBX is pence.
- **Trading 212 responses:** treat every field as optional, and respect the per-endpoint rate limits in `api.ts`. The API reference is at <https://docs.trading212.com/api>.
- **Schema changes:** edit `src/main/db/schema.ts`, run `bun run db:generate`, and commit the generated `drizzle/` files with your change.
- **AI providers** live in `src/main/ai/providers.ts`. Adding one there also adds its hosts to the allow-list, for when it's selected. Ollama must stay on loopback.
- **UI** uses shadcn/ui components from `src/renderer/src/components/ui` and AI Elements for chat.

Keep PRs to one change, and say in the description what you checked by hand. By contributing you agree your work is released under the [MIT License](LICENSE).
