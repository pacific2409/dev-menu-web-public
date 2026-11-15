import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type {
  SharedHistoryApiClient,
  SharedHistoryDetailApiResult,
} from '../api/sharedHistoryApi.ts';
import type { SharedHistoryDetailModel } from '../model/sharedHistory.ts';
import { useSharedHistoryDetail } from './useSharedHistoryDetail.ts';

const detail: SharedHistoryDetailModel = {
  historyId: '20',
  createdAt: '2026-01-02T03:04:05Z',
  createdAtLabel: '2026年1月2日 03:04',
  conditions: {
    technologyId: '2',
    technologyName: 'React',
    difficulty: '2',
    difficultyLabel: '中級',
    durationHours: 4,
    purpose: '1',
    purposeLabel: '技術習得',
    additionalPreference: null,
  },
  practiceProposals: [1, 2, 3].map((proposalNumber) => ({
    proposalNumber: proposalNumber as 1 | 2 | 3,
    title: `課題${String(proposalNumber)}`,
    overview: '概要',
    achievementGoal: '目標',
    practiceFocus: 'ポイント',
  })),
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createApiClient(
  getHistoryDetail: SharedHistoryApiClient['getHistoryDetail'],
): SharedHistoryApiClient {
  return {
    listTechnologies: vi.fn().mockResolvedValue({ kind: 'success', technologies: [] }),
    listHistories: vi.fn().mockResolvedValue({
      kind: 'success',
      result: { technologyId: '1', technologyName: 'React', sharedHistories: [] },
    }),
    getHistoryDetail,
  };
}

describe('useSharedHistoryDetail', () => {
  it.each([undefined, '0', '01', '+1', '1.0', ' 1', '9223372036854775808'])(
    'rejects invalid route ID %s without a request',
    (historyId) => {
      const getHistoryDetail = vi.fn<SharedHistoryApiClient['getHistoryDetail']>();
      const { result } = renderHook(() =>
        useSharedHistoryDetail(historyId, createApiClient(getHistoryDetail)),
      );

      expect(result.current.screenState).toBe('invalid-history-id');
      expect(getHistoryDetail).not.toHaveBeenCalled();
    },
  );

  it('loads a valid detail and exposes only the mapped result', async () => {
    const getHistoryDetail = vi
      .fn<SharedHistoryApiClient['getHistoryDetail']>()
      .mockResolvedValue({ kind: 'success', result: detail });
    const apiClient = createApiClient(getHistoryDetail);
    const { result } = renderHook(() => useSharedHistoryDetail('20', apiClient));

    expect(result.current.screenState).toBe('loading');
    await waitFor(() => {
      expect(result.current.screenState).toBe('success');
    });
    expect(result.current.detail).toBe(detail);
    expect(getHistoryDetail).toHaveBeenCalledWith('20', expect.any(AbortSignal));
  });

  it('retries the same ID and aborts the previous request', async () => {
    const first = deferred<SharedHistoryDetailApiResult>();
    const getHistoryDetail = vi
      .fn<SharedHistoryApiClient['getHistoryDetail']>()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce({ kind: 'success', result: detail });
    const apiClient = createApiClient(getHistoryDetail);
    const { result } = renderHook(() => useSharedHistoryDetail('20', apiClient));
    const firstSignal = getHistoryDetail.mock.calls[0]?.[1];

    act(() => {
      result.current.retry();
    });
    await waitFor(() => {
      expect(getHistoryDetail).toHaveBeenCalledTimes(2);
      expect(result.current.screenState).toBe('success');
    });
    expect(firstSignal?.aborted).toBe(true);
  });

  it('aborts on route change and ignores the stale result', async () => {
    const first = deferred<SharedHistoryDetailApiResult>();
    const getHistoryDetail = vi
      .fn<SharedHistoryApiClient['getHistoryDetail']>()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce({ kind: 'not-found' });
    const apiClient = createApiClient(getHistoryDetail);
    const { result, rerender } = renderHook(
      ({ historyId }) => useSharedHistoryDetail(historyId, apiClient),
      { initialProps: { historyId: '20' } },
    );
    const firstSignal = getHistoryDetail.mock.calls[0]?.[1];

    rerender({ historyId: '21' });
    await waitFor(() => {
      expect(result.current.screenState).toBe('not-found');
    });
    expect(firstSignal?.aborted).toBe(true);

    await act(async () => {
      first.resolve({ kind: 'success', result: detail });
      await first.promise;
    });
    expect(result.current.screenState).toBe('not-found');
    expect(result.current.detail).toBeUndefined();
  });

  it('aborts a pending request when unmounted', () => {
    const pending = deferred<SharedHistoryDetailApiResult>();
    const getHistoryDetail = vi
      .fn<SharedHistoryApiClient['getHistoryDetail']>()
      .mockImplementation(() => pending.promise);
    const apiClient = createApiClient(getHistoryDetail);
    const view = renderHook(() => useSharedHistoryDetail('20', apiClient));
    const signal = getHistoryDetail.mock.calls[0]?.[1];

    view.unmount();
    expect(signal?.aborted).toBe(true);
  });
});
