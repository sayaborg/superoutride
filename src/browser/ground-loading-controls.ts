/** Loading keeps the completed canvas visible and offers retry without changing the selected build. */
export function mountGroundLoadingControls(retry: () => void) {
  const panel = document.createElement('section');
  panel.id = 'ground-loading';
  panel.setAttribute('data-driving-input', 'ignore');
  panel.setAttribute('aria-live', 'polite');
  const message = document.createElement('span');
  const retryButton = document.createElement('button');
  retryButton.type = 'button';
  retryButton.textContent = 'RETRY';
  retryButton.addEventListener('click', retry);
  panel.append(message, retryButton);
  document.body.append(panel);
  const controls = document.querySelectorAll<HTMLElement>('#dev-panel .selector-group:not(.selector-group-course)');
  return {
    update(state: 'loading' | 'ready' | 'failed'): void {
      panel.hidden = state === 'ready';
      retryButton.hidden = state !== 'failed';
      message.textContent =
        state === 'failed' ? 'Course could not load. Retry or select another course.' : 'Loading course…';
      for (const control of controls) control.inert = state !== 'ready';
    },
    dispose(): void {
      panel.remove();
      for (const control of controls) control.inert = false;
    },
  };
}
