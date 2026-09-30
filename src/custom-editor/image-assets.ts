// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import path from 'node:path';
import * as vscode from 'vscode';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']);

const MIME_EXTENSION_BY_TYPE = new Map<string, string>([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/gif', 'gif'],
  ['image/svg+xml', 'svg'],
  ['image/webp', 'webp'],
]);

const padTimestampPart = (value: number): string => String(value).padStart(2, '0');

export type HostImageInsertKind = 'paste' | 'drop' | 'command';

export type ImageValidationFailure = 'unsupportedType' | 'tooLarge' | 'empty';

export type ImageValidationResult =
  | {
      ok: true;
      extension: string;
    }
  | {
      ok: false;
      reason: ImageValidationFailure;
    };

export const getImageExtension = (name?: string, mime?: string): string | undefined => {
  const namedExtension = name ? path.extname(name).slice(1).toLowerCase() : '';
  if (namedExtension.length > 0) {
    return namedExtension;
  }

  const normalizedMime = mime?.toLowerCase().split(';', 1)[0]?.trim();
  if (!normalizedMime) {
    return undefined;
  }
  return MIME_EXTENSION_BY_TYPE.get(normalizedMime);
};

export const validateImageAsset = (input: {
  byteLength: number;
  name?: string;
  mime?: string;
}): ImageValidationResult => {
  if (input.byteLength <= 0) {
    return { ok: false, reason: 'empty' };
  }
  if (input.byteLength > MAX_IMAGE_BYTES) {
    return { ok: false, reason: 'tooLarge' };
  }

  const extension = getImageExtension(input.name, input.mime);
  if (!extension || !ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
    return { ok: false, reason: 'unsupportedType' };
  }

  return { ok: true, extension };
};

export const formatPasteImageFileName = (date: Date, extension: string): string => {
  const timestamp = [
    date.getFullYear(),
    padTimestampPart(date.getMonth() + 1),
    padTimestampPart(date.getDate()),
    '-',
    padTimestampPart(date.getHours()),
    padTimestampPart(date.getMinutes()),
    padTimestampPart(date.getSeconds()),
  ].join('');
  return `image-${timestamp}.${extension}`;
};

export const sanitizeImageFileName = (name: string, extension: string): string => {
  const baseName = [...path.basename(name)]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || String.raw`<>:"/\|?*`.includes(character) ? '-' : character;
    })
    .join('')
    .trim();
  if (baseName.length === 0 || baseName === '.' || baseName === '..') {
    return `image.${extension}`;
  }

  if (path.extname(baseName).length > 0) {
    return baseName;
  }
  return `${baseName}.${extension}`;
};

export const appendDeduplicationSuffix = (fileName: string, suffix: number): string => {
  const extension = path.extname(fileName);
  const stem = extension.length > 0 ? fileName.slice(0, -extension.length) : fileName;
  return `${stem}-${suffix}${extension}`;
};

export const normalizeImageDestination = (destination: string | undefined): string => {
  const normalized = (destination?.trim() || 'images')
    .replaceAll('\\', '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  const safeSegments = normalized
    .split('/')
    .filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
  return safeSegments.length > 0 ? safeSegments.join('/') : 'images';
};

export const getImageDestinationDirectory = (
  documentUri: vscode.Uri,
  destination: string | undefined,
): vscode.Uri => vscode.Uri.joinPath(documentUri, '..', normalizeImageDestination(destination));

const encodeMarkdownImagePath = (sourcePath: string): string =>
  sourcePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

const decodeMarkdownImagePath = (source: string): string | undefined => {
  try {
    return source
      .split('/')
      .map((segment) => decodeURIComponent(segment))
      .join('/');
  } catch {
    return undefined;
  }
};

export const getMarkdownImagePath = (documentUri: vscode.Uri, imageUri: vscode.Uri): string => {
  if (documentUri.scheme !== imageUri.scheme || documentUri.authority !== imageUri.authority) {
    throw new Error('Linked files must use the same file-system provider.');
  }
  return encodeMarkdownImagePath(
    path.posix.relative(path.posix.dirname(documentUri.path), imageUri.path),
  );
};

export const isRemoteOrDataImageSource = (source: string): boolean =>
  /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(source) || source.startsWith('#');

export const resolveMarkdownImageUri = (
  documentUri: vscode.Uri,
  source: string,
): vscode.Uri | undefined => {
  if (documentUri.scheme === 'untitled' || isRemoteOrDataImageSource(source)) {
    return undefined;
  }

  const decodedSource = decodeMarkdownImagePath(source);
  if (!decodedSource) {
    return undefined;
  }

  return vscode.Uri.joinPath(documentUri, '..', decodedSource);
};
