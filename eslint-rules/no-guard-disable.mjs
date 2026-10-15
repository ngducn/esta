const DISABLE_DIRECTIVE = /^eslint-disable(?:-next-line|-line)?(?=\s|$)/u;
const DESCRIPTION_SEPARATOR = /\s-{2,}\s/u;
const GUARD_RULES = 'eslint-comments/';
const COLUMN_BEFORE_ANY_DIRECTIVE = -1;

const locBeforeAnyDirective = ({ start, end }) => ({ start: { line: start.line, column: COLUMN_BEFORE_ANY_DIRECTIVE }, end });

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A disable directive that names an eslint-comments rule also silences the report that would catch it, so it is itself the error.',
    },
    messages: {
      guard: 'Do not switch off an eslint-comments rule. The directive would silence the guard that checks the next directive.',
    },
    schema: [],
  },
  create(context) {
    for (const comment of context.sourceCode.getAllComments()) {
      const text = comment.value.trim();
      const directive = DISABLE_DIRECTIVE.exec(text);
      if (!directive) continue;
      const [rules = ''] = text.slice(directive[0].length).split(DESCRIPTION_SEPARATOR);
      if (!rules.includes(GUARD_RULES)) continue;
      context.report({ loc: locBeforeAnyDirective(comment.loc), messageId: 'guard' });
    }
    return {};
  },
};
