// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

export type CodeLanguageOption = Readonly<{
  value: string;
  label: string;
}>;

// The first word of a fence info string names its language; the rest are attributes.
const INFO_LANGUAGE = /^(\s*)(\S*)/;
export const getCodeFenceLanguage = (info: string): string =>
  INFO_LANGUAGE.exec(info)![2].toLowerCase();
export const setCodeFenceLanguage = (info: string, language: string): string =>
  info.replace(INFO_LANGUAGE, (_word, space: string) => space + language);

export const CODE_LANGUAGE_OPTIONS: ReadonlyArray<CodeLanguageOption> = [
  { value: '', label: 'Plain text' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'tsx', label: 'TSX' },
  { value: 'jsx', label: 'JSX' },
  { value: 'python', label: 'Python' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'java', label: 'Java' },
  { value: 'csharp', label: 'C#' },
  { value: 'cpp', label: 'C++' },
  { value: 'bash', label: 'Bash' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'sql', label: 'SQL' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'mermaid', label: 'Mermaid' },
  { value: 'unsupported', label: 'Unsupported' },
];
