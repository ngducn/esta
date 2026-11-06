import { NO_SOURCE_SENTENCE } from '@esta/core/assistant';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import vi from '../../../messages/vi.json';

describe('the sentence Trợ lý answers when it finds no official source', () => {
  it('reads the same in the message files and in the core registry the agent answers from', () => {
    expect(NO_SOURCE_SENTENCE).toEqual({ vi: vi.assistant.ask.noSource, en: en.assistant.ask.noSource });
  });
});
