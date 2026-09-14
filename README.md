# Nimcade

Nimcade is a swipe feed of endless arcade micro games that runs inside [Nimiq Pay](https://nimiq.com/pay/) as a mini app. Swipe up for the next game, tap to play, and chase your best score. Every game can be tipped: one tap sends NIM straight from your Nimiq Pay wallet to the game's maker. A Daily Cup ranks the day's best runs per game and pays out from a prize pool.

Only the card on screen runs; swipe away and it pauses and resets. Best scores live on the device, and there is no backend yet: the Daily Cup currently runs on mock data behind a swappable interface ([src/lib/cupMock.ts](src/lib/cupMock.ts)).

## The games

- **Dot Rush**: steer through the maze with the arrow pad, clear every dot and dodge the chasers; grab a NIM coin to turn the tables.
- **Tower Up**: the crane swings each floor over your tower; hold to lower, release to drop, and stack as high as you can.
- **The Void**: a 3D tunnel run; drag the ball through the gaps in oncoming gates and hold boost for double points.
- **Flip Dodge**: tap to flip lanes and dodge the barriers as the road keeps speeding up.
- **Tap Frenzy**: how many taps can you land in 60 seconds?

## Tech stack

- [Vite](https://vite.dev/), [React 19](https://react.dev/) and TypeScript, styled with plain CSS
- [`@nimiq/mini-app-sdk`](https://www.npmjs.com/package/@nimiq/mini-app-sdk) for the wallet: `init`, `listAccounts`, `sendBasicTransaction`
- [Three.js](https://threejs.org/) for The Void, loaded lazily in its own chunk
- Space Grotesk via [Fontsource](https://fontsource.org/), self-hosted
- [Vitest](https://vitest.dev/) for unit tests, [oxlint](https://oxc.rs/) for linting

## Run it locally

Requires Node.js 22 or newer.

```bash
npm install
cp .env.example .env   # set VITE_MAKER_ADDRESS to the Nimiq address that receives tips
npm run dev
```

Open <http://localhost:5173>. Everything plays in a desktop browser; the wallet features need Nimiq Pay.

```bash
npm test          # unit tests
npm run build     # type-check and bundle to dist/
npm run preview   # serve the production build
npm run lint
npm run icons     # regenerate the app icons from src/ui/brand/chevron.ts
```

## Load it in Nimiq Pay

The dev server listens on your network, so a phone on the same Wi-Fi can reach it.

1. Run `npm run dev` and note the **Network** URL Vite prints, for example `http://192.168.1.42:5173`.
2. Open **Nimiq Pay** on your phone and go to **Mini Apps**.
3. Enter that address in the **Custom URL** field.

Tips send real NIM on mainnet. To test without real funds, open the Nimiq Pay menu and long-press the settings button for 10 seconds to reveal the dev menu, switch to **Testnet**, then tap **Get free NIM** on the home screen.

## License

MIT, see [LICENSE](LICENSE).
