import { createCn } from 'cn/config';
import { typeScale } from '@/design/tokens';

/** Without the token type scale, merging reads `text-small` as a color and drops it beside `text-ink`. */
export const cn = createCn({
  extend: {
    classGroups: { 'font-size': [{ text: Object.keys(typeScale) }] },
    theme: { spacing: ['touch'] },
  },
});
