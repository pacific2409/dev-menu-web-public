import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type {
  PracticeProposalApiClient,
  PracticeProposalApiResult,
} from '../api/practiceProposalApi.ts';
import { usePracticeProposal } from './usePracticeProposal.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('usePracticeProposal', () => {
  it('revalidates an erroneous field while it is edited and clears the summary', () => {
    const apiClient: PracticeProposalApiClient = { create: vi.fn() };
    const { result } = renderHook(() => usePracticeProposal(apiClient));

    act(() => {
      result.current.validateField('technologyName');
    });
    expect(result.current.errors.technologyName).toBe('学びたい技術を入力してください。');

    act(() => {
      result.current.updateField('technologyName', 'React');
    });
    expect(result.current.errors.technologyName).toBeUndefined();
    expect(result.current.isValidationSummaryVisible).toBe(false);
  });

  it('ignores a second submit while the first request is active', async () => {
    const pending = deferred<PracticeProposalApiResult>();
    const create = vi.fn(() => pending.promise);
    const { result } = renderHook(() => usePracticeProposal({ create }));

    act(() => {
      result.current.updateField('technologyName', 'React');
      result.current.updateField('difficulty', '2');
      result.current.updateField('durationHours', '12');
      result.current.updateField('purpose', '1');
    });

    let first!: Promise<unknown>;
    await act(async () => {
      first = result.current.submit();
      await Promise.resolve();
    });
    await expect(result.current.submit()).resolves.toEqual({ kind: 'none' });
    expect(create).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve({ kind: 'generic-error' });
      await first;
    });
    expect(result.current.isSubmitting).toBe(false);
  });
});
