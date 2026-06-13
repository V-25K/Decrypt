## Decrypt (Devvit Web Game)

Daily cryptogram-style puzzle game built for Reddit using Devvit Web.

## For players
Crack a daily cipher: tap a tile, type the letter you think it hides, and watch
matching tiles fill in. Solve before you run out of hearts to climb the global
leaderboard, earn coins, complete quests, and unlock flair. You can also create
and share your own challenges for the community to solve.

## Features
- Inline gameplay with expanded view support.
- Daily automated puzzles plus manual moderator tools.
- Leaderboards, quests, and powerups.
- In-app purchases (Reddit Gold) for bundles.

## Legal
- Terms: `TERMS_AND_CONDITIONS.md`
- Privacy: `PRIVACY_POLICY.md`

## Latest Patch
- Added Decrypt Difficulty 2.0, a human-centered difficulty model that separates player difficulty, solver fairness, and live calibration.
- Added richer cryptogram signals for generated and manual puzzles, including common-word anchors, rare-word pressure, repeated patterns, reveal coverage, lock coverage, and blind-tile pressure.
- Added V2 difficulty breakdowns for private/admin flows, with manual and community previews showing confidence, fairness status, and concrete layout guidance instead of silently changing community layouts.
- Added calibration artifact versioning and guardrails so stale or sparse telemetry falls back to static V2 defaults instead of overcorrecting tiers.
- Expanded solver validation thresholds and lexicon coverage while keeping solver results focused on fairness and confidence rather than dominating human difficulty.
- Added community puzzle routes/screens, preview UI assets, leaderboard/rating improvements, outcome rendering polish, stats compatibility fixes, and payment/dialog test coverage.
- Verified with `npm run type-check`, `npm run lint`, `npm run build`, full `npm run test`, focused Difficulty 2.0 smoke tests, and bounded Devvit playtest/log checks on `decrypttest_dev`.

## Versions
- 1.0.0
  - First stable release: daily cryptogram gameplay with hearts, power-ups
    (hammer, wand, rocket, shield), padlock chains, and blind tiles.
  - Global rating/leaderboards, quests, daily streaks, and unlockable flair that
    carries the player's global rank.
  - Player-created community challenges with creator acclaim, plus a moderator
    toolkit (daily reroll, manual injection, challenge editing).
  - Reddit payments bundles, AI-assisted daily generation, and Decrypt
    Difficulty 2.0 calibration.
  - Hardening pass: self-play guard, padlock-unlock and correct-letter guess-race
    fixes, and rebalanced power-ups (rocket reveals 3 letters; flawless coin
    bonus requires a no-power-up clear).
- 0.1.0
  - Added Decrypt Difficulty 2.0 with V2 private breakdowns, human-centered phrase profiling, solver fairness separation, and telemetry calibration guardrails.
  - Added manual/community difficulty preview explanations with confidence, anchor coverage, fairness status, and suggested layout changes.
  - Added community puzzle infrastructure, including server routes, shared schemas, client screen support, and manual layout regression tests.
  - Added global rating/leaderboard improvements and safer legacy stats rendering for older player profiles.
  - Added preview entrypoint styling/tests, virtual keyboard overlay support, new UI assets, and expanded client outcome coverage.
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
