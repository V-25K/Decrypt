import { Hono } from 'hono';
import { manualPuzzleRoutes } from './manual-puzzle';
import { clearSubredditDataRoutes } from './clear-subreddit-data';

// Aggregate all mod-facing form submission endpoints under a single Hono app.
// app.ts mounts this at /internal/forms (so a route like
// `clearSubredditDataRoutes.post('/mod-clear-subreddit-data-submit', ...)`
// becomes POST /internal/forms/mod-clear-subreddit-data-submit).
export const forms = new Hono();
forms.route('/', manualPuzzleRoutes);
forms.route('/', clearSubredditDataRoutes);
