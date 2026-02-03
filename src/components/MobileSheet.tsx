import React, { useEffect, useMemo, useState } from 'react';

export interface MobileSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  zIndex?: number;
}

export const MobileSheet: React.FC<MobileSheetProps> = ({
  open,
  title,
  onClose,
  children,
  zIndex = 1300,
}) => {
  const [render, setRender] = useState(open);
  const [shown, setShown] = useState(open);

  useEffect(() => {
    if (open) {
      setRender(true);
      const id = window.requestAnimationFrame(() => setShown(true));
      return () => window.cancelAnimationFrame(id);
    }

    setShown(false);
    const t = window.setTimeout(() => setRender(false), 240);
    return () => window.clearTimeout(t);
  }, [open]);

  const overlayClass = useMemo(
    () =>
      'absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200 ' +
      (shown ? 'opacity-100' : 'opacity-0'),
    [shown]
  );

  const sheetClass = useMemo(
    () =>
      'mx-auto w-full max-w-3xl transform-gpu transition-all duration-300 ease-out ' +
      (shown ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'),
    [shown]
  );

  if (!render) return null;

  return (
    <div className="fixed inset-0" style={{ zIndex }} role="dialog" aria-modal="true">
      <div className={overlayClass} onClick={onClose} aria-hidden />

      <div className="absolute inset-x-0 bottom-0" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className={sheetClass}>
          <div className="relative overflow-hidden rounded-t-3xl border border-gray-200 bg-white shadow-2xl">
            <div
              className={
                'pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-blue-50 via-white to-white transform-gpu transition-transform duration-500 ' +
                (shown ? '-translate-y-3 scale-[1.03]' : 'translate-y-0 scale-100')
              }
            />

            <div className="p-4 sm:p-5">
              <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-gray-300" />
              <div className="flex items-center justify-between gap-3">
                <div className="text-base sm:text-lg font-bold text-gray-900">{title}</div>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 rounded-xl text-sm font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Kapat
                </button>
              </div>

              <div className="mt-4">{children}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
