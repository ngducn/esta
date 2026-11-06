import { describe, expect, it } from 'vitest';
import { callerVerdictProblems } from './caller-verdict.ts';

describe('callerVerdictProblems', () => {
  it('passes when no function takes a verdict', () => {
    expect(callerVerdictProblems([])).toEqual([]);
  });

  it('fails a function that takes its caller’s verdict, naming the parameter', () => {
    expect(callerVerdictProblems(['public.approve_proposal(p_params_valid)'])).toEqual([
      'public.approve_proposal(p_params_valid) takes a decision from its caller; decide it inside the function, from the stored rows, and pgTAP the refusal',
    ]);
  });
});
