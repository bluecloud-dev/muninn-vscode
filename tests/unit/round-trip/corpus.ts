import * as fs from 'node:fs';
import path from 'node:path';

import {
  parseHostMarkdown,
  serializeToHostMarkdown,
} from '../../../src/webview/editor/markdown-codec';

// Compiled tests execute from out/tests/unit/round-trip; fixtures live in the source tree.
const repositoryRoot = path.resolve(__dirname, '..', '..', '..', '..');
const roundTripRoot = path.join(repositoryRoot, 'tests', 'unit', 'round-trip');
const fixturesRoot = path.join(roundTripRoot, 'fixtures');
const deviationsPath = path.join(roundTripRoot, 'deviations.json');

export type DeviationKind = 'final-newline-only' | 'construct';

export type DeviationRecord = {
  fixture: string;
  category: string;
  // 'final-newline-only': output + '\n' equals the input byte-for-byte — the construct
  // itself survives; only the serializer's missing trailing newline differs.
  // 'construct': the output diverges beyond the trailing newline.
  kind: DeviationKind;
  rootCause: string;
  issue?: string;
};

export type FixtureCase = {
  name: string;
  category: string;
  input: string;
  synthesizedFrom?: string;
};

export type RoundTripOutcome = {
  fixtureName: string;
  category: string;
  input: string;
  output: string;
  matches: boolean;
  // True when the only difference is the missing trailing newline.
  tailNewlineOnly: boolean;
  deviation?: DeviationRecord;
  synthesizedFrom?: string;
};

export const runRoundTrip = (hostMarkdown: string): string =>
  serializeToHostMarkdown(parseHostMarkdown(hostMarkdown));

const categoryOf = (fixtureName: string): string =>
  fixtureName.split('--', 1)[0] ?? 'uncategorized';

// CRLF, trailing-space, and missing-final-newline cases are synthesized here instead of
// being stored on disk: editors, format-on-save hooks, and git EOL settings silently
// normalize exactly the bytes these cases exist to test.
const synthesizedCases = (stored: FixtureCase[]): FixtureCase[] => {
  const plainParagraphs = stored.find((fixture) => fixture.name === 'paragraphs--plain.md');
  if (!plainParagraphs) {
    throw new Error('paragraphs--plain.md must exist; the CRLF case derives from it');
  }
  return [
    {
      name: 'line-endings--crlf (synthesized)',
      category: 'line-endings',
      input: plainParagraphs.input.replaceAll('\n', '\r\n'),
      synthesizedFrom: 'paragraphs--plain.md with every LF replaced by CRLF',
    },
    {
      name: 'whitespace--no-final-newline (synthesized)',
      category: 'whitespace',
      input: '# Tail\n\nThe file ends without a final newline.',
      synthesizedFrom: 'inline literal without a terminating newline',
    },
    {
      name: 'whitespace--trailing-single-space (synthesized)',
      category: 'whitespace',
      input: 'A line with one trailing space \ncontinues here.\n',
      synthesizedFrom: 'inline literal with one trailing space (no hard break implied)',
    },
    {
      name: 'breaks--hard-two-spaces (synthesized)',
      category: 'breaks',
      input: 'alpha  \nbeta\n',
      synthesizedFrom: 'inline literal where two trailing spaces force a hard break',
    },
  ];
};

export const loadFixtureCases = (): FixtureCase[] => {
  const stored = fs
    .readdirSync(fixturesRoot)
    .filter((fileName) => fileName.endsWith('.md'))
    .toSorted()
    .map((fileName) => ({
      name: fileName,
      category: categoryOf(fileName),
      input: fs.readFileSync(path.join(fixturesRoot, fileName), 'utf8'),
    }));
  return [...stored, ...synthesizedCases(stored)];
};

export const loadDeviationRecords = (): DeviationRecord[] =>
  JSON.parse(fs.readFileSync(deviationsPath, 'utf8')) as DeviationRecord[];

export const evaluateCorpus = (): RoundTripOutcome[] => {
  const deviationsByFixture = new Map(
    loadDeviationRecords().map((record) => [record.fixture, record]),
  );
  return loadFixtureCases().map((fixture) => {
    const output = runRoundTrip(fixture.input);
    const matches = output === fixture.input;
    return {
      fixtureName: fixture.name,
      category: fixture.category,
      input: fixture.input,
      output,
      matches,
      tailNewlineOnly: !matches && `${output}\n` === fixture.input,
      deviation: deviationsByFixture.get(fixture.name),
      synthesizedFrom: fixture.synthesizedFrom,
    };
  });
};

const visibleLine = (line: string | undefined): string =>
  line === undefined ? '(line absent)' : JSON.stringify(line);

// Byte-honest mismatch report: first divergent line with context, escapes made visible
// so trailing whitespace, CR bytes, and missing newlines are unambiguous in CI logs.
export const formatMismatch = (input: string, output: string): string => {
  const inputLines = input.split('\n');
  const outputLines = output.split('\n');
  const lineCount = Math.max(inputLines.length, outputLines.length);
  let divergenceIndex = 0;
  while (
    divergenceIndex < lineCount &&
    inputLines[divergenceIndex] === outputLines[divergenceIndex]
  ) {
    divergenceIndex += 1;
  }
  const contextStart = Math.max(0, divergenceIndex - 2);
  const contextEnd = Math.min(lineCount, divergenceIndex + 3);
  const report: string[] = [
    `first divergence at line ${divergenceIndex + 1}`,
    `input ends with newline: ${input.endsWith('\n')}; output ends with newline: ${output.endsWith('\n')}`,
  ];
  for (let index = contextStart; index < contextEnd; index += 1) {
    const marker = index === divergenceIndex ? '>' : ' ';
    report.push(
      `${marker} input  ${index + 1}: ${visibleLine(inputLines[index])}`,
      `${marker} output ${index + 1}: ${visibleLine(outputLines[index])}`,
    );
  }
  return report.join('\n');
};
