#!/usr/bin/env node
// Preview bundle perf guard.
//
// Devvit inline-mode requires the preview ("default" entrypoint) to load
// initial content in <1s with a Lighthouse score >80
// (https://developers.reddit.com/docs/.../view_modes_entry_points). The worst
// regression is React / the game shell entering the preview's EAGER load path.
// That can happen two ways:
//   1. A <script> / <link rel="modulepreload"> in preview.html pointing at a
//      React/game chunk (HTML-level warming).
//   2. The preview entry chunk STATICALLY importing (and thus executing) a
//      React/game chunk at runtime, even if the HTML looks clean.
//
// Decrypt's preview must stay vanilla DOM and only `import('./game')` (React)
// LAZILY on the completed/failed path. This guard walks the preview entry's
// static import graph (following `from"./x.js"` / bare `import"./x.js"`, but
// NOT dynamic `import("./x.js")`) and fails if any reachable chunk is a
// React/game chunk. It also rejects forbidden HTML refs.
//
// Usage:  npm run build && npm run check:preview-bundle
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const distClient = path.join(projectRoot, 'dist', 'client');
const previewHtmlPath = path.join(distClient, 'preview.html');

const FORBIDDEN_CHUNK =
  /\b(react-vendor|react-dom-vendor|game-shell|game-ui|game2)\.js$/;

const basename = (ref) => ref.replace(/^.*\//, '');

// HTML refs: executed <script src> + warmed <link rel=modulepreload href>.
const collectHtmlRefs = (html) => {
  const refs = [];
  const scriptRe = /<script\b[^>]*\bsrc=["']([^"']+)["']/gi;
  const preloadRe =
    /<link\b[^>]*\brel=["']modulepreload["'][^>]*\bhref=["']([^"']+)["']/gi;
  for (const re of [scriptRe, preloadRe]) {
    let m;
    while ((m = re.exec(html)) !== null) refs.push(m[1]);
  }
  return refs;
};

// Static (NOT dynamic) imports of a built chunk: `from"./x.js"` and bare
// side-effect `import"./x.js"`. Dynamic `import("./x.js")` is intentionally
// excluded — that is the legitimate lazy path.
const collectStaticImports = (code) => {
  const imports = new Set();
  const fromRe = /\bfrom\s*["'](\.\/[^"']+\.js)["']/g;
  const bareRe = /(?<!\()\bimport\s*["'](\.\/[^"']+\.js)["']/g;
  for (const re of [fromRe, bareRe]) {
    let m;
    while ((m = re.exec(code)) !== null) imports.add(basename(m[1]));
  }
  return [...imports];
};

const main = async () => {
  let html;
  try {
    html = await readFile(previewHtmlPath, 'utf8');
  } catch (_e) {
    throw new Error('dist/client/preview.html not found. Run `npm run build`.');
  }

  const htmlRefs = collectHtmlRefs(html);
  const entryScripts = htmlRefs.filter((r) => /\.js$/.test(r)).map(basename);
  if (entryScripts.length === 0) {
    throw new Error('No <script> entry found in preview.html — investigate.');
  }

  const offenders = new Set(
    htmlRefs.map(basename).filter((r) => FORBIDDEN_CHUNK.test(r))
  );

  // BFS the static import graph from the preview entry script(s).
  const visited = new Set();
  const queue = [...entryScripts];
  while (queue.length > 0) {
    const chunk = queue.shift();
    if (visited.has(chunk)) continue;
    visited.add(chunk);
    if (FORBIDDEN_CHUNK.test(chunk)) {
      offenders.add(chunk);
      continue; // no need to descend into a forbidden chunk
    }
    let code;
    try {
      code = await readFile(path.join(distClient, chunk), 'utf8');
    } catch {
      continue; // missing/non-JS ref; skip
    }
    for (const dep of collectStaticImports(code)) {
      if (!visited.has(dep)) queue.push(dep);
    }
  }

  if (offenders.size > 0) {
    console.error('Preview bundle guard FAILED for dist/client/preview.html:');
    console.error(
      `  React/game chunks are reachable from the preview's eager graph:\n${[
        ...offenders,
      ]
        .map((o) => `    - ${o}`)
        .join('\n')}`
    );
    console.error(
      '\nThe preview entry (preview.ts) must stay vanilla DOM and only\n' +
        "import('./game') LAZILY. If a static import pulls a React/game chunk,\n" +
        'split the shared helper(s) out of game-shell and pin Vite\'s preload\n' +
        'helper to its own chunk (see vite.config.ts manualChunks).'
    );
    process.exit(1);
  }

  console.log(
    `Preview bundle ok: preview entry graph is React-free ` +
      `(${visited.size} static chunk(s) walked from ${entryScripts.join(', ')}).`
  );
};

main().catch((error) => {
  console.error(`Preview bundle guard errored: ${error.message ?? error}`);
  process.exit(1);
});
