// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

export type ToolbarRovingFocusController = {
  revalidateCurrentStop: (preferredFallback?: HTMLButtonElement) => void;
};

const NAVIGATION_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End']);

const isVisibleButton = (button: HTMLButtonElement): boolean =>
  !button.disabled && !button.closest('[hidden]');

const resolveFallback = (
  visibleButtons: HTMLButtonElement[],
  preferredFallback?: HTMLButtonElement,
): HTMLButtonElement | undefined => {
  if (preferredFallback && visibleButtons.includes(preferredFallback)) {
    return preferredFallback;
  }
  return visibleButtons[0];
};

export const attachToolbarRovingFocus = (toolbar: HTMLElement): ToolbarRovingFocusController => {
  const getButtons = (): HTMLButtonElement[] => [...toolbar.querySelectorAll('button')];
  const getVisibleButtons = (): HTMLButtonElement[] =>
    getButtons().filter((button) => isVisibleButton(button));
  let currentStop: HTMLButtonElement | undefined = getVisibleButtons().find(
    (button) => button.tabIndex === 0,
  );

  const setCurrentStop = (button: HTMLButtonElement | undefined, shouldFocus = false): void => {
    for (const toolbarButton of getButtons()) {
      toolbarButton.tabIndex = toolbarButton === button ? 0 : -1;
    }

    currentStop = button;
    if (button && shouldFocus) {
      button.focus();
    }
  };

  const revalidateCurrentStop = (preferredFallback?: HTMLButtonElement): void => {
    const visibleButtons = getVisibleButtons();
    if (currentStop && visibleButtons.includes(currentStop)) {
      setCurrentStop(currentStop);
      return;
    }
    setCurrentStop(resolveFallback(visibleButtons, preferredFallback));
  };

  const moveFocus = (target: HTMLButtonElement, key: string): void => {
    const visibleButtons = getVisibleButtons();
    if (visibleButtons.length === 0) {
      return;
    }

    if (key === 'Home') {
      setCurrentStop(visibleButtons[0], true);
      return;
    }

    if (key === 'End') {
      setCurrentStop(visibleButtons.at(-1), true);
      return;
    }

    const targetIndex = visibleButtons.includes(target)
      ? visibleButtons.indexOf(target)
      : Math.max(visibleButtons.indexOf(currentStop ?? visibleButtons[0]), 0);
    const offset = key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (targetIndex + offset + visibleButtons.length) % visibleButtons.length;
    setCurrentStop(visibleButtons[nextIndex], true);
  };

  toolbar.addEventListener('focusin', (event) => {
    const target = event.target as HTMLButtonElement | null;
    if (
      !target ||
      !toolbar.contains(target) ||
      !getButtons().includes(target) ||
      !isVisibleButton(target)
    ) {
      return;
    }
    setCurrentStop(target);
  });

  toolbar.addEventListener('keydown', (event) => {
    if (!NAVIGATION_KEYS.has(event.key)) {
      return;
    }

    const target = event.target as HTMLButtonElement | null;
    if (!target || !toolbar.contains(target) || !getButtons().includes(target)) {
      return;
    }

    event.preventDefault();
    moveFocus(target, event.key);
  });

  revalidateCurrentStop();
  return { revalidateCurrentStop };
};
