'use client';

import { useEffect, useState, type InputHTMLAttributes } from 'react';
import { marketDate, parseMarketDate } from '@/lib/consoleTime';

/**
 * A console date input that shows and accepts "16 Nov 2026" (owner 24 Nov), never the browser's
 * "mm/dd/yyyy". Drop-in for `<input type="date">`: `value` and `onChange` carry "2026-11-16".
 */
export function DateField({ value, onChange, className = 'ops-select', ...rest }: {
  value: string; onChange: (iso: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const [text, setText] = useState(marketDate(value));
  useEffect(() => setText(marketDate(value)), [value]);
  const bad = text.trim() !== '' && parseMarketDate(text) === null;
  return (
    <input {...rest} type="text" className={className} value={text} inputMode="text" autoComplete="off"
      placeholder="16 Nov 2026" aria-invalid={bad || undefined} size={11}
      onChange={(e) => {
        setText(e.target.value);
        if (e.target.value.trim() === '') onChange('');
        const iso = parseMarketDate(e.target.value);
        if (iso) onChange(iso);
      }}
      onBlur={() => { const iso = parseMarketDate(text); if (iso) setText(marketDate(iso)); }} />
  );
}
