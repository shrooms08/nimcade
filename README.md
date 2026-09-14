# Nimcade

Nimcade is a [Nimiq Pay](https://nimiq.com/pay/) mini app that turns micro games into a feed: a vertical, TikTok-style swipe stack where every card is a 10–20 second one-thumb game, and every card has a "Tip 1 NIM" button that pays the game's maker directly from the player's Nimiq Pay wallet. Only the card filling the screen runs — swipe away and the game pauses and resets. This repository is Phase 1: the feed shell, one placeholder game ("Tap Tempo"), wallet connection through `@nimiq/mini-app-sdk`, and a working tip transaction. Best scores are stored per device in `localStorage`; there is no backend.

## Run it locally

Requires Node.js 22+.

```bash
npm install
cp .env.example .env      # then set VITE_MAKER_ADDRESS to a real Nimiq address
npm run dev
```

The dev server binds to `0.0.0.0:5173`, so the app is reachable from a phone on the same Wi-Fi:

- Desktop browser: <http://localhost:5173> — the feed and the game work, the wallet pill shows **Open in Nimiq Pay**.
- Phone: open **Nimiq Pay → Mini Apps**, enter `http://<your-mac-ip>:5173` in the custom URL field.

Find your Mac's LAN IP with `ipconfig getifaddr en0`, or read the **Network** URL that Vite prints on start.

Tips send real NIM. To test without real funds, switch Nimiq Pay to testnet: long-press the settings button for 10 seconds to reveal the dev menu, pick **Testnet**, then use **Get free NIM**.

```bash
npm run build      # type-check and bundle to dist/
npm run preview    # serve the production build
npm run lint
```

## How it fits together

| Path | Role |
| --- | --- |
| [src/games/types.ts](src/games/types.ts) | The `Game` interface and the `{ active, onScore }` contract every game implements |
| [src/games/registry.ts](src/games/registry.ts) | The array of games the feed renders, in order |
| [src/games/TapTempo.tsx](src/games/TapTempo.tsx) | Placeholder game: tap with the pulsing beat, 10 taps, score 0–100 |
| [src/components/Feed.tsx](src/components/Feed.tsx) | CSS scroll-snap container; an `IntersectionObserver` marks one card `active` |
| [src/components/GameCard.tsx](src/components/GameCard.tsx) | Game area, title, maker, best score, tip button |
| [src/lib/nimiq.ts](src/lib/nimiq.ts) | SDK wrapper: `init()`, `listAccounts()`, `sendBasicTransaction()`, NIM↔Luna |
| [src/lib/useWallet.ts](src/lib/useWallet.ts) | Connection state machine behind the status pill |

## Adding a game

1. Write a component that takes `{ active, onScore }` and pauses **and resets** when `active` is false.
2. Add an entry to `games` in [src/games/registry.ts](src/games/registry.ts) with a unique `id`, a `title`, a `maker`, and the maker's Nimiq address.

## Approval dialogs

Nimcade asks for the account as soon as Nimiq Pay's provider is ready, so the status pill can show the address without a tap — that means one approval dialog on load. Flip `REQUEST_ACCOUNT_ON_LOAD` to `false` in [src/lib/useWallet.ts](src/lib/useWallet.ts) to turn the pill into a "Connect wallet" button and keep every approval dialog behind an explicit tap. Tips always require a tap.

## Nimiq provider methods used

- `init({ timeout })` — waits for Nimiq Pay to inject the provider (3s here, then the app falls back to browser mode)
- `listAccounts()` — first address is shown in the status pill
- `sendBasicTransaction({ recipient, value })` — the tip; `value` is in Luna (1 NIM = 100,000 Luna)

## License

[MIT](LICENSE)
