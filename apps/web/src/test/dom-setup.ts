import { cleanup } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeAll } from 'vitest';
import { renderInLocale } from './render';

// The first React and next-intl render in a worker pays the cold JIT, over 1 s beside other suites; a hook has 10 s, a test 5.
beforeAll(() => {
  renderInLocale(createElement('div'));
  cleanup();
});

afterEach(cleanup);
