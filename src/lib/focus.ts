/**
 * Move focus to an element that a server refresh may not have rendered yet.
 * Retries for a few frames, then gives up quietly. focus() also scrolls the
 * element into view, which is what makes a finished AI review findable when it
 * renders somewhere else on the page.
 */
export function focusWhenReady(id: string, attempts = 30): void {
  if (typeof document === "undefined") return;
  const el = document.getElementById(id);
  if (el) {
    el.focus();
    return;
  }
  if (attempts <= 0) return;
  requestAnimationFrame(() => focusWhenReady(id, attempts - 1));
}
