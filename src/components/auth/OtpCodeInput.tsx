import React, { useEffect, useMemo, useRef } from 'react';

function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

export interface OtpCodeInputProps {
  value: string;
  onChange: (next: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}

export default function OtpCodeInput({
  value,
  onChange,
  length = 6,
  disabled = false,
  autoFocus = true,
  className,
}: OtpCodeInputProps) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const digits = useMemo(() => {
    const cleaned = onlyDigits(value).slice(0, length);
    const arr = cleaned.split('');
    while (arr.length < length) arr.push('');
    return arr;
  }, [value, length]);

  useEffect(() => {
    if (!autoFocus) return;
    const firstEmptyIndex = digits.findIndex(d => !d);
    const idx = firstEmptyIndex === -1 ? length - 1 : Math.max(0, firstEmptyIndex);
    const el = inputsRef.current[idx];
    if (el && document.activeElement !== el) {
      // next tick helps on mobile keyboards
      window.setTimeout(() => el.focus(), 0);
    }
  }, [autoFocus, digits, length]);

  const setAt = (index: number, nextDigit: string) => {
    const cleaned = onlyDigits(nextDigit).slice(-1);
    const nextDigits = [...digits];
    nextDigits[index] = cleaned;
    onChange(nextDigits.join('').replace(/\s/g, ''));
  };

  const focusIndex = (index: number) => {
    const el = inputsRef.current[index];
    if (el) el.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text');
    const cleaned = onlyDigits(text).slice(0, length);
    if (!cleaned) return;
    e.preventDefault();
    onChange(cleaned);
    const nextIndex = Math.min(cleaned.length, length - 1);
    window.setTimeout(() => focusIndex(nextIndex), 0);
  };

  return (
    <div className={className} onPaste={handlePaste}>
      <div className="grid grid-cols-6 gap-2">
        {Array.from({ length }).map((_, i) => (
          <input
            key={i}
            ref={el => {
              inputsRef.current[i] = el;
            }}
            disabled={disabled}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            value={digits[i]}
            onChange={e => {
              const v = onlyDigits(e.target.value);
              if (v.length <= 1) {
                setAt(i, v);
                if (v && i < length - 1) focusIndex(i + 1);
                return;
              }
              // user typed/pasted multiple digits into one box
              const cleaned = v.slice(0, length);
              onChange(cleaned);
              const nextIndex = Math.min(cleaned.length, length - 1);
              focusIndex(nextIndex);
            }}
            onKeyDown={e => {
              if (e.key === 'Backspace') {
                if (digits[i]) {
                  setAt(i, '');
                  return;
                }
                if (i > 0) {
                  focusIndex(i - 1);
                  setAt(i - 1, '');
                }
              }
              if (e.key === 'ArrowLeft' && i > 0) focusIndex(i - 1);
              if (e.key === 'ArrowRight' && i < length - 1) focusIndex(i + 1);
            }}
            className="h-12 w-full rounded-xl border border-gray-200 bg-white/70 text-center text-lg font-semibold tracking-widest shadow-sm outline-none backdrop-blur focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 disabled:opacity-60"
            aria-label={`OTP digit ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
