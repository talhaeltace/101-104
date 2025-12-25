import { useEffect } from 'react';

let lockCount = 0;
let previousOverflow: string | null = null;
let previousPaddingRight: string | null = null;

function lockBodyScroll() {
  if (typeof document === 'undefined') return;

  if (lockCount === 0) {
    previousOverflow = document.body.style.overflow;
    previousPaddingRight = document.body.style.paddingRight;

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }

  lockCount += 1;
}

function unlockBodyScroll() {
  if (typeof document === 'undefined') return;

  lockCount = Math.max(0, lockCount - 1);

  if (lockCount === 0) {
    document.body.style.overflow = previousOverflow ?? '';
    document.body.style.paddingRight = previousPaddingRight ?? '';
    previousOverflow = null;
    previousPaddingRight = null;
  }
}

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [active]);
}
