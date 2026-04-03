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

## Legal
- Terms: `TERMS_AND_CONDITIONS.md`
- Privacy: `PRIVACY_POLICY.md`

## Versions
- 0.1.0
  - Modularized client architecture and improved inline performance.
  - Added randomized challenge type rotation with strict type enforcement.
  - Added double-lock challenge generation for higher difficulties.
  - Hardened payments idempotency with Redis NX guard.
  - Added daily data TTLs and automation safeguards.
- 0.0.0
  - Initial functional release of Decrypt with core gameplay, quests, and payments sandbox support.
