import type { IsoDate } from '@esta/core/date';
import { useState } from 'react';

/** What a date field holds: the day, and whether the text typed in it is not a day on the calendar. */
export type DateReading = { readonly value: IsoDate | null; readonly unreadable: boolean };

export const dateReading = (value: IsoDate | null): DateReading => ({ value, unreadable: false });

/** Props for `DateInput` that fill `reading` as Mẹ types. */
export function dateInputProps(reading: DateReading, onChange: (reading: DateReading) => void) {
  return {
    ...(reading.value === null ? {} : { defaultValue: reading.value }),
    onValueChange: (value: IsoDate | null, readable: boolean) => onChange({ value, unreadable: !readable }),
  };
}

/** A date field that may stay empty; a save must refuse while `reading.unreadable`. */
export function useDateField(initial: IsoDate | null) {
  const [reading, setReading] = useState(() => dateReading(initial));
  return { reading, input: dateInputProps(reading, setReading) };
}
