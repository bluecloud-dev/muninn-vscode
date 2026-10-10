// SPDX-FileCopyrightText: 2026 Muninn contributors
// SPDX-License-Identifier: AGPL-3.0-only

export const setIconButton = (
  button: HTMLButtonElement,
  icon: string,
  label: string,
  help = label,
): void => {
  button.classList.add('muninn-icon-button');
  button.setAttribute('aria-label', label);
  button.dataset.help = help;
  button.removeAttribute('title');
  const glyph = document.createElement('span');
  glyph.className = 'codicon codicon-' + icon;
  glyph.setAttribute('aria-hidden', 'true');
  button.replaceChildren(glyph);
  if (button.hasAttribute('aria-describedby')) {
    const tooltip = document.querySelector<HTMLElement>('#muninn-control-help');
    if (tooltip) tooltip.textContent = help;
  }
};

export const attachIconHelp = (container: HTMLElement): void => {
  const tooltip = document.createElement('div');
  tooltip.id = 'muninn-control-help';
  tooltip.className = 'muninn-control-help';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  container.append(tooltip);
  let current: HTMLButtonElement | undefined;
  const hide = (): void => {
    if (current) resizeObserver?.unobserve(current);
    current?.removeAttribute('aria-describedby');
    current = undefined;
    tooltip.hidden = true;
  };
  const show = (event: Event): void => {
    const button =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>('button[data-help]')
        : undefined;
    if (!button || button === current) return;
    hide();
    current = button;
    tooltip.textContent = button.dataset.help!;
    tooltip.hidden = false;
    button.setAttribute('aria-describedby', tooltip.id);
    position();
    resizeObserver?.observe(button);
  };
  const position = (): void => {
    if (!current) return;
    const rect = current.getBoundingClientRect();
    tooltip.style.left =
      Math.max(8, Math.min(rect.left, window.innerWidth - tooltip.offsetWidth - 8)) + 'px';
    tooltip.style.top =
      (rect.bottom + tooltip.offsetHeight + 8 < window.innerHeight
        ? rect.bottom + 4
        : Math.max(4, rect.top - tooltip.offsetHeight - 4)) + 'px';
  };
  const resizeObserver =
    typeof ResizeObserver === 'function' ? new ResizeObserver(position) : undefined;
  resizeObserver?.observe(container);
  // Scroll changes the anchor position even while its intersection ratio stays constant.
  // eslint-disable-next-line unicorn/prefer-observer-apis
  container.addEventListener('scroll', position, { capture: true });
  container.addEventListener('focusin', show);
  container.addEventListener('pointerover', show);
  container.addEventListener('focusout', hide);
  container.addEventListener('pointerout', (event) => {
    if (!current || document.activeElement === current) return;
    if (
      !(event.target instanceof Node) ||
      (!current.contains(event.target) && !tooltip.contains(event.target))
    )
      return;
    if (
      event.relatedTarget instanceof Node &&
      (tooltip.contains(event.relatedTarget) || current?.contains(event.relatedTarget))
    )
      return;
    hide();
  });
  container.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !tooltip.hidden) {
      event.preventDefault();
      hide();
    }
  });
};
