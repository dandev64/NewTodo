// iOS keeps `position: fixed; bottom: 0` elements under the on-screen keyboard.
// Track the visual viewport and expose how much of the layout viewport the keyboard
// covers (--kb) and the visible height (--vvh), so bottom sheets can sit above it.
export function trackVisualViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement.style;
  const update = () => {
    const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    root.setProperty('--kb', `${Math.round(covered)}px`);
    root.setProperty('--vvh', `${Math.round(vv.height)}px`);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
}

/**
 * Scroll `el` into the part of the screen the keyboard doesn't cover. Focusing an input
 * from a tap opens the iOS keyboard *after* focus, so iOS doesn't scroll the input up;
 * we re-check whenever the visual viewport resizes during the next second.
 */
export function revealAboveKeyboard(el: HTMLElement, margin = 24) {
  const vv = window.visualViewport;
  const reveal = () => {
    if (!el.isConnected) return;
    const r = el.getBoundingClientRect();
    const top = vv ? vv.offsetTop : 0;
    const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    if (r.bottom + margin > bottom) window.scrollBy({ top: r.bottom + margin - bottom, behavior: 'smooth' });
    else if (r.top < top + margin) window.scrollBy({ top: r.top - top - margin, behavior: 'smooth' });
  };
  requestAnimationFrame(reveal);
  if (!vv) return;
  vv.addEventListener('resize', reveal);
  setTimeout(() => vv.removeEventListener('resize', reveal), 1200);
}
