// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { getString } from '../localization';
type MermaidRenderResult =
  | {
      ok: true;
      svg: string;
    }
  | {
      ok: false;
      error: string;
    };

let themeObserver: MutationObserver | undefined;
let enabled = false;
const policyListeners = new Set<() => void>();
export const isMermaidRenderingEnabled = (): boolean => enabled;
export const setMermaidRenderingEnabled = (value: boolean): void => {
  if (enabled === value) return;
  enabled = value;
  for (const listener of policyListeners) listener();
};
export const onMermaidPolicyChanged = (listener: () => void): (() => void) => {
  policyListeners.add(listener);
  if (!themeObserver && typeof MutationObserver !== 'undefined') {
    themeObserver = new MutationObserver(() => {
      for (const notify of policyListeners) notify();
    });
    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-vscode-theme-id'],
    });
  }
  return () => {
    policyListeners.delete(listener);
    if (policyListeners.size === 0) {
      themeObserver?.disconnect();
      themeObserver = undefined;
    }
  };
};
const disabledResult = (): MermaidRenderResult => ({
  ok: false,
  error: getString('mermaidDisabledMessage'),
});
let initialized = false;
let lastThemeSignature: string | undefined;

type MermaidThemeState = {
  signature: string;
  variables: Record<string, string>;
};

type MermaidModule = {
  default: {
    initialize: (options: {
      startOnLoad: boolean;
      securityLevel: 'strict';
      suppressErrorRendering: boolean;
      theme: string;
      themeVariables: Record<string, string>;
      flowchart: {
        htmlLabels: boolean;
      };
    }) => void;
    render: (renderId: string, source: string) => Promise<{ svg: string }>;
  };
};

let mermaidModulePromise: Promise<MermaidModule> | undefined;
let renderQueue: Promise<void> = Promise.resolve();

const readCssVariable = (name: string, fallback: string): string => {
  const value = getComputedStyle(document.body).getPropertyValue(name).trim();
  return value.length > 0 ? value : fallback;
};

const getMermaidThemeState = (): MermaidThemeState => {
  const foreground = readCssVariable('--vscode-editor-foreground', '#d4d4d4');
  const background = readCssVariable('--vscode-editor-background', '#1e1e1e');
  const border = readCssVariable('--vscode-editorWidget-border', foreground);
  const panelBackground = readCssVariable('--vscode-editorWidget-background', background);
  const subtleBackground = readCssVariable('--vscode-list-hoverBackground', panelBackground);
  const edgeLabelBackground = readCssVariable('--vscode-input-background', panelBackground);

  const variables: Record<string, string> = {
    textColor: foreground,
    lineColor: border,
    primaryTextColor: foreground,
    primaryBorderColor: border,
    primaryColor: panelBackground,
    secondaryTextColor: foreground,
    secondaryBorderColor: border,
    secondaryColor: subtleBackground,
    tertiaryTextColor: foreground,
    tertiaryBorderColor: border,
    tertiaryColor: subtleBackground,
    clusterBkg: panelBackground,
    clusterBorder: border,
    edgeLabelBackground,
    background,
    mainBkg: panelBackground,
    secondBkg: subtleBackground,
  };

  return {
    signature: Object.values(variables).join('|'),
    variables,
  };
};

const loadMermaid = async (): Promise<MermaidModule> => {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import('mermaid') as Promise<MermaidModule>;
  }
  return mermaidModulePromise;
};

const ensureInitialized = (mermaidModule: MermaidModule): void => {
  const themeState = getMermaidThemeState();
  if (initialized && themeState.signature === lastThemeSignature) {
    return;
  }

  mermaidModule.default.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    theme: 'base',
    themeVariables: themeState.variables,
    flowchart: {
      htmlLabels: false,
    },
  });
  initialized = true;
  lastThemeSignature = themeState.signature;
};

export const renderMermaidDiagram = async (
  source: string,
  renderId: string,
): Promise<MermaidRenderResult> => {
  const queuedRender = async (): Promise<MermaidRenderResult> => {
    if (!enabled) return disabledResult();
    try {
      const mermaidModule = await loadMermaid();
      if (!enabled) return disabledResult();
      ensureInitialized(mermaidModule);
      const rendered = await mermaidModule.default.render(renderId, source);
      if (!enabled) return disabledResult();
      return {
        ok: true,
        svg: rendered.svg,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        error: message,
      };
    }
  };

  const resultPromise = renderQueue.then(queuedRender, queuedRender);
  renderQueue = resultPromise.then(
    () => {},
    () => {},
  );
  return resultPromise;
};
