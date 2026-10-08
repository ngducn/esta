import { createCn } from 'cn/engine';
import tables from './cn-tables';

/** `pnpm tokens:build` compiles the tables from tokens.css, so merging reads `text-small` as a size beside `text-ink`. */
export const cn = createCn(tables);
