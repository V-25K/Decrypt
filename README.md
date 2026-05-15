## Decrypt (Devvit Web Game)

Daily cryptogram-style puzzle game built for Reddit using Devvit Web.

## Features
- Inline gameplay with expanded view support.
- Daily automated puzzles plus manual moderator tools.
- Leaderboards, quests, and powerups.
- In-app purchases (Reddit Gold) for bundles.

## Architecture
- `src/client`: UI and app experience running in Reddit webviews.
- `src/server`: Hono/Devvit server routes, scheduler hooks, and tRPC API.
- `src/server/trpc`: Domain routers (`game`, `leaderboard`, `quests`, `admin`, etc.) plus shared procedures.
- `src/shared`: Runtime-safe schemas/types reused by client and server.

## Production Practices
- Strict TypeScript + schema validation at API boundaries.
- Feature routers are separated by responsibility to keep modules small and testable.
- Centralized server app composition (`createApp`) with shared unhandled-error handling.
- Devvit-specific config lives in `devvit.json`, with settings validated through `/internal/settings/*` endpoints.

## Local Tools
- `npm run lines:check -- --text "QUOTE HERE"` checks a single line against your local manual registry.
- `npm run lines:check -- --file .\my-lines.txt` batch-checks one line per row from a text file.
- `npm run lines:check -- --corpus-file .\data\manual-line-registry.json --text "QUOTE HERE"` lets you point at a different registry file.
- The checker uses the same normalization and near-duplicate rules as the game, but it does not inspect live Redis history from deployed installs.

## Legal
- Terms: `TERMS_AND_CONDITIONS.md`
- Privacy: `PRIVACY_POLICY.md`

## Latest Patch
- Better scoring so completed challenges always earn points.
- More reliable leaderboard behavior, including top-player focus and clearer rank visibility.
- Visual step-by-step help overlay instead of a text-only instructions card.
- Persistent audio setting saved per player profile.
- Stronger challenge/session persistence and result-screen reliability fixes.
- Improved daily automation and publish safeguards for scheduled challenge posting.

## Versions
- 0.1.0
  - Modularized client architecture and improved inline performance.
  - Added randomized challenge type rotation with strict type enforcement.
  - Added double-lock challenge generation for higher difficulties.
  - Added the full mobile-first game shell with puzzle board, keyboard, HUD, powerups, shop, quests, stats, and leaderboard screens.
  - Added pixel-art UI assets, optimized WebP backgrounds, critical asset preloads, and faster first-paint loading states.
  - Added interactive help walkthrough, settings overlay, persistent audio preferences, and clearer result-screen feedback.
  - Added paid daily retries, retry score penalties, old-daily reward safeguards, and refreshed daily quests.
  - Added endless catalog activation workflow and admin tooling for publishing endless level packs.
  - Improved puzzle navigation with keyboard arrows that skip locked and filled tiles.
  - Improved result screens with safer completion rendering, crowd layout fixes, and cleaner quote/author styling.
  - Hardened payments idempotency with Redis NX guard.
  - Fixed payment fulfillment transactions for playtest bundle purchases.
  - Redacted API keys from AI generation failure logs.
  - Added daily data TTLs and automation safeguards.
  - Added local line-checking tools for manual puzzle quote review.
- 0.0.0
  - Initial functional release of Decrypt with core gameplay, quests, and payments sandbox support.
