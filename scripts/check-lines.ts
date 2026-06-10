import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  checkLineAgainstCorpusEntries,
  defaultManualLineRegistryPath,
  loadManualLineRegistryEntries,
  type LocalLineCheckResult,
} from '../src/server/core/line-checker.ts';

type ParsedArgs = {
  corpusFilePath: string;
  filePath: string | null;
  json: boolean;
  showHelp: boolean;
  texts: string[];
};

const usage = `Usage:
  npm run lines:check -- --text "TO BE OR NOT TO BE"
  npm run lines:check -- --file .\\my-lines.txt
  npm run lines:check -- --corpus-file .\\data\\manual-line-registry.json --text "TO BE OR NOT TO BE"

Notes:
  - Checks against a local registry file for your manual endless workflow.
  - Default corpus file: data/manual-line-registry.json
  - Does not inspect live Devvit Redis history from deployed installs.
  - File mode reads one non-empty line per quote.`;

const parseArgs = (argv: string[]): ParsedArgs => {
  const texts: string[] = [];
  let corpusFilePath = defaultManualLineRegistryPath;
  let filePath: string | null = null;
  let json = false;
  let showHelp = false;
  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      showHelp = true;
      continue;
    }
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--text') {
      const value = argv[index + 1];
      if (value) {
        texts.push(value);
        index += 1;
      }
      continue;
    }
    if (arg === '--file') {
      const value = argv[index + 1];
      if (value) {
        filePath = value;
        index += 1;
      }
      continue;
    }
    if (arg === '--corpus-file') {
      const value = argv[index + 1];
      if (value) {
        corpusFilePath = value;
        index += 1;
      }
      continue;
    }
    positional.push(arg);
  }

  if (texts.length === 0 && positional.length > 0) {
    texts.push(positional.join(' '));
  }

  return {
    corpusFilePath,
    filePath,
    json,
    showHelp,
    texts,
  };
};

const loadTextsFromFile = (filePath: string): string[] => {
  const raw = readFileSync(resolve(filePath), 'utf8');
  return raw
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
};

const statusLabel = (status: LocalLineCheckResult['status']): string => {
  if (status === 'exact_match') {
    return 'USED';
  }
  if (status === 'near_duplicate') {
    return 'SIMILAR';
  }
  return 'CLEAR';
};

const printHumanResult = (result: LocalLineCheckResult): void => {
  console.log(`[${statusLabel(result.status)}] ${result.inputText}`);
  console.log(`  reason: ${result.reason}`);
  console.log(`  normalized: ${result.normalizedSignature || '(empty)'}`);

  if (result.exactMatches.length > 0) {
    for (const match of result.exactMatches) {
      console.log(
        `  match: ${match.levelId} | ${match.sourceLabel} | ${match.challengeType ?? 'UNKNOWN'} | ${match.targetText}`
      );
    }
    return;
  }

  if (result.matchedEntry) {
    console.log(
      `  closest: ${result.matchedEntry.levelId} | ${result.matchedEntry.sourceLabel} | ${result.matchedEntry.challengeType ?? 'UNKNOWN'} | ${result.matchedEntry.targetText}`
    );
  }
};

const main = (): void => {
  const args = parseArgs(process.argv.slice(2));
  if (args.showHelp) {
    console.log(usage);
    process.exit(0);
  }

  const fileTexts = args.filePath ? loadTextsFromFile(args.filePath) : [];
  const texts = [...args.texts, ...fileTexts];

  if (texts.length === 0) {
    console.error(usage);
    process.exit(1);
  }

  const corpusEntries = loadManualLineRegistryEntries(args.corpusFilePath);
  const results = texts.map((text) => checkLineAgainstCorpusEntries(text, corpusEntries));

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          checked: results.length,
          corpusFile: resolve(args.corpusFilePath),
          corpusSize: corpusEntries.length,
          scope: 'local manual line registry only; live Redis history not included',
          results,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(
    `Checked ${results.length} line(s) against ${corpusEntries.length} local registry entr${
      corpusEntries.length === 1 ? 'y' : 'ies'
    } from ${resolve(args.corpusFilePath)}. Live Redis history is not included.`
  );
  for (const result of results) {
    printHumanResult(result);
  }
};

main();
