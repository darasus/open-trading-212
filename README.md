# open-trading-212

A privacy-first portfolio cockpit for [Trading 212](https://www.trading212.com), shipped as a desktop app for macOS and Windows, with an AI analyst that runs its tools over your data locally.

**There is no open-trading-212 server.** Your Trading 212 API key lives in your operating system's keychain. Your positions, orders, dividends and deposits live in a SQLite file on your disk. The app talks to exactly two things: Trading 212, and the AI provider you configure with your own key.

**Read-only by design.** The Trading 212 client can only send `GET` requests. There is no code that places, edits or cancels an order, and the Connect screen asks for a key with read permissions only.

Not affiliated with or endorsed by Trading 212.

## What it does

- **Overview:** account value over time, invested vs. unrealised P/L, cash, holdings with return on cost and weight, allocation by holding, currency and asset type, dividend income by month and by payer, rule-based insights, and a searchable feed of every trade, dividend and deposit.
- **Chat:** an AI analyst with tools that run locally over your data. Every tool call shows you exactly what the model received. Bring your own key for Anthropic, OpenAI, Google or OpenRouter, or run a model locally with Ollama. It explains your data; it is not a financial adviser and does not tell you what to buy or sell.

## Trust model

| Data                                | Where                                     | Leaves this computer?                               |
| ----------------------------------- | ----------------------------------------- | --------------------------------------------------- |
| Trading 212 API key and secret      | OS keychain via Electron `safeStorage`    | Only to Trading 212                                 |
| AI provider keys                    | OS keychain                               | Only to that provider                               |
| Positions, orders, dividends, chats | Local SQLite                              | Never                                               |
| Data the AI sees                    | Shown per question under "Sent to the AI" | Only that tool result, to your own provider account |

Enforced in code, not just claimed:

- `src/main/network.ts` wraps the global `fetch` in the main process, which the Trading 212 client and every AI provider use, with an allow-list: `live.trading212.com`, `demo.trading212.com`, the host of the one AI provider you selected, and this repository's GitHub Releases for updates. Anything else fetched, including the other AI providers, throws before a connection is made. Local-only mode blocks cloud AI providers; Ollama keeps working because its URL must be on this computer (localhost).
- Electron's own network stack is filtered per session. The updater's session can only reach this repository's releases; the default session, which the window and Electron's `net` module use, can only load the app's own files.
- Links open in your browser only over https. A link in a chat answer shows you the full URL and asks first.
- `src/main/t212/api.ts` only has a `get` method. Pagination paths returned by Trading 212 are checked to stay on the same endpoint.
- The renderer window is sandboxed with `contextIsolation` and no Node, and its session is blocked from the network entirely. It can only call the typed IPC surface in `src/shared/ipc.ts`.
- The SQL tool the model can use runs on a separate read-only connection with `query_only` set, SELECT-only checks and a row cap.
- "Wipe everything" deletes the database, every secret and all chats, then restarts the app.

Honest limits: the allow-list covers `fetch` and Electron sessions, not raw sockets, so a dependency that connected through Node's `http`, `https` or `net` modules directly would not be stopped. Trading 212 has no historical value endpoint, so on days without a sync the value chart is an estimate: holdings are rebuilt by replaying your trades and priced between the prices of your own fills and today's price. Days with a sync show the real account total. Sync only happens while the app is open, and history endpoints are limited to 6 requests a minute, so a long history takes a few minutes to backfill the first time. The app is only as read-only as the key you give it.

## Install

Download the installer for your system from [Releases](https://github.com/darasus/open-trading-212/releases): a `.dmg` for macOS (Apple silicon or Intel) or a `-setup.exe` for Windows. The builds are not code-signed yet, so:

- **macOS:** open the app once and dismiss the warning that Apple can't check it. Then go to System Settings, Privacy & Security, and choose Open Anyway next to open-trading-212. Automatic updates can't install on an unsigned app, so download new versions from Releases.
- **Windows:** if SmartScreen warns you, choose More info, then Run anyway.

Or build it yourself; see [Development](#development).

## Getting started

1. In the Trading 212 app: Settings, API (Beta), Generate API key. Tick only the read permissions (account, portfolio, metadata, history). Copy the key and the secret; the secret is shown once.
2. In open-trading-212: Settings, Connect Trading 212, pick Real money or Practice, paste both.
3. Optional: under Settings, AI, pick a provider (Anthropic, OpenAI, Google, OpenRouter or Ollama), add its key, and choose a model. Model lists load live from the provider, and any model id can be typed in.

Each Trading 212 account (Invest, Stocks ISA, Practice) has its own key.

## Out of scope

- Placing, editing or cancelling orders, or managing pies. The app is read-only and stays that way.
- CFD accounts. Trading 212's public API covers Invest and Stocks ISA.
- Market data or price history beyond what your account endpoints return. No third-party price source is on the allow-list.
- More than one connected account at a time.
- Linux and mobile builds.

## Development

```bash
bun install
bun run dev
```

```bash
bun run typecheck
bun run lint
bun run format       # oxfmt; CI runs format:check
bun run test         # vitest over the main-process logic, with a throwaway SQLite file
bun run db:generate  # after editing src/main/db/schema.ts
bun run build:mac    # unsigned local build into release/
```

In development only, the main process falls back to `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` or `OPENROUTER_API_KEY` from the shell if no key is stored for that provider, so the chat can be exercised without pasting one. Packaged builds never read the environment.

## Layout

- `src/main` runs in Node: Trading 212 client and sync, keychain, SQLite, analysis, AI tools and chat streaming.
- `src/preload` exposes the typed bridge as `window.ot212`.
- `src/renderer` is React, shadcn/ui and AI Elements. No Node, no network.
- `src/shared` holds the IPC contract.

## Releasing

Bump `version` in `package.json`, commit, tag `vX.Y.Z` and push the tag. The release workflow builds macOS (arm64 and x64) and Windows installers and publishes them to GitHub Releases. Add `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` as repository secrets to sign and notarize the macOS build; without them the build is unsigned.

## License

MIT
