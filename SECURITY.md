# Security

open-trading-212 holds a Trading 212 API key and a local copy of your portfolio, and its whole pitch is that neither leaves your computer except to the services you chose. A bug that breaks that promise is a security bug.

## Reporting a vulnerability

Please report privately through [GitHub's vulnerability reporting](https://github.com/darasus/open-trading-212/security/advisories/new), not in a public issue. Include what you found, how to reproduce it, and which version and platform you used.

You should hear back within a week. Once a fix is released, the advisory is published with credit to you unless you would rather stay anonymous.

## In scope

Anything that breaks a claim in the README's [trust model](README.md#trust-model), for example:

- A request to Trading 212 that is not a `GET`, or any way to place, change or cancel an order.
- The main process reaching a host outside the allow-list, or the window reaching the network at all.
- The Trading 212 key, its secret or an AI provider key being written anywhere other than the OS keychain, or sent anywhere other than its own service.
- Portfolio data or chats being sent anywhere other than the AI provider you selected, and then only as the tool results shown under "Sent to the AI".
- The model's SQL tool writing to the database, or reading files other than the database.
- Content in the window, such as a chat answer, running code, reaching Node, or opening a non-https link.
- Update integrity: an update served from anywhere other than this repository's GitHub Releases.

## Out of scope

- A Trading 212 key created with write permissions. The app never writes, but it can only be as read-only as the key you give it.
- Anything your AI provider does with the data you chose to send it.
- Attacks that need an attacker already running code as your user on your computer.
- Unsigned builds you made yourself.

## Supported versions

Only the latest release gets fixes.
