import { createCn } from 'cn/engine';
import tables from './cn-tables';

/** `pnpm tokens:build` compiles the tables from tokens.css, so merging reads `text-body-sm` as a size beside `text-text`. */
export const cn = createCn(tables);
