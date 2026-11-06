const EQUALITY = new Set(['===', '!==', '==', '!=']);
const ADDRESS = /address/iu;

const NORMALISER = /^(normalizeName|comparable|normali[sz]e)$/u;

const calleeName = (node) => {
  if (node.type !== 'CallExpression') return null;
  if (node.callee.type === 'Identifier') return node.callee.name;
  return node.callee.type === 'MemberExpression' && !node.callee.computed && node.callee.property.type === 'Identifier' ? node.callee.property.name : null;
};

const sameNormaliser = (left, right) => {
  const name = calleeName(left);
  return name !== null && NORMALISER.test(name) && name === calleeName(right);
};

const isZero = (node) => node.type === 'Literal' && node.value === 0;

const isLiteral = (node) => node.type === 'Literal' || (node.type === 'TemplateLiteral' && node.expressions.length === 0) || (node.type === 'Identifier' && node.name === 'undefined');

const mentionsAddress = (node) => {
  if (!node || typeof node.type !== 'string') return false;
  if (node.type === 'Identifier') return ADDRESS.test(node.name);
  if (node.type === 'MemberExpression') return mentionsAddress(node.object) || (!node.computed && mentionsAddress(node.property));
  if (node.type === 'CallExpression') return mentionsAddress(node.callee) || node.arguments.some(mentionsAddress);
  if (node.type === 'ChainExpression' || node.type === 'TSNonNullExpression' || node.type === 'TSAsExpression') return mentionsAddress(node.expression);
  return false;
};

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Two addresses are compared by `sameAddress` in packages/core/src/address, so every screen calls the same two addresses the same.' },
    messages: { sameAddress: 'Compare addresses with `sameAddress` from `@esta/core/address`. A second spelling of the rule drifts from the first (Q-10).' },
    schema: [],
  },
  create(context) {
    return {
      BinaryExpression(node) {
        if (!EQUALITY.has(node.operator)) return;
        const compared = isZero(node.right) ? node.left : isZero(node.left) ? node.right : null;
        if (compared !== null && calleeName(compared) === 'localeCompare' && mentionsAddress(compared)) context.report({ node, messageId: 'sameAddress' });
        if (isLiteral(node.left) || isLiteral(node.right)) return;
        if (sameNormaliser(node.left, node.right)) return void context.report({ node, messageId: 'sameAddress' });
        const wrapped = node.left.type === 'CallExpression' && node.right.type === 'CallExpression' && (mentionsAddress(node.left) || mentionsAddress(node.right));
        if (wrapped || (mentionsAddress(node.left) && mentionsAddress(node.right))) context.report({ node, messageId: 'sameAddress' });
      },
    };
  },
};
