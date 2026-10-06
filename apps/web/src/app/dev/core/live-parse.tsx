'use client';

import { formatVnd } from '@esta/core/format';
import { parseVndInput } from '@esta/core/parse/vnd-input';
import { useId, useState } from 'react';

export function LiveParse() {
  const inputId = useId();
  const [text, setText] = useState('');
  const result = parseVndInput(text);

  return (
    <section aria-labelledby={`${inputId}-heading`} className="flex flex-col gap-2">
      <h2 id={`${inputId}-heading`} className="text-lg font-semibold">
        Live parseVndInput
      </h2>
      <label htmlFor={inputId} className="text-sm">
        Amount as typed
      </label>
      <input
        id={inputId}
        data-testid="live-parse-input"
        value={text}
        onChange={(event) => setText(event.target.value)}
        inputMode="text"
        autoComplete="off"
        className="max-w-xs rounded border px-3 py-2 text-base"
      />
      <output htmlFor={inputId} data-testid="live-parse-output" aria-live="polite" className="tabular-nums">
        {result.ok ? formatVnd(result.value, 'vi') : `rejected: ${result.reason}`}
      </output>
    </section>
  );
}
