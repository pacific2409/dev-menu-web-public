/* eslint-disable react-hooks/set-state-in-effect -- This hook synchronizes an explicit screen state machine with route state and request lifecycles. */
import { useEffect, useRef, useState } from 'react';

import type { SharedHistoryApiClient } from '../api/sharedHistoryApi.ts';
import {
  isPublicId,
  type SharedHistoryDetailModel,
  type SharedHistoryDetailScreenState,
} from '../model/sharedHistory.ts';

export function useSharedHistoryDetail(
  historyId: string | undefined,
  apiClient: SharedHistoryApiClient,
) {
  const isValidHistoryId = isPublicId(historyId);
  const [screenState, setScreenState] = useState<SharedHistoryDetailScreenState>(
    isValidHistoryId ? 'loading' : 'invalid-history-id',
  );
  const [detail, setDetail] = useState<SharedHistoryDetailModel>();
  const [retrySequence, setRetrySequence] = useState(0);
  const requestSequenceRef = useRef(0);

  useEffect(() => {
    requestSequenceRef.current += 1;
    setDetail(undefined);
    if (!isPublicId(historyId)) {
      setScreenState('invalid-history-id');
      return;
    }

    const validatedHistoryId = historyId;
    const controller = new AbortController();
    const requestSequence = requestSequenceRef.current;
    setScreenState('loading');

    async function loadDetail() {
      try {
        const result = await apiClient.getHistoryDetail(validatedHistoryId, controller.signal);
        if (controller.signal.aborted || requestSequence !== requestSequenceRef.current) {
          return;
        }
        switch (result.kind) {
          case 'success':
            setDetail(result.result);
            setScreenState('success');
            break;
          case 'invalid-history-id':
            setScreenState('invalid-history-id');
            break;
          case 'not-found':
            setScreenState('not-found');
            break;
          case 'generic-error':
            setScreenState('load-error');
            break;
        }
      } catch {
        if (controller.signal.aborted || requestSequence !== requestSequenceRef.current) {
          return;
        }
        setScreenState('load-error');
      }
    }

    void loadDetail();
    return () => {
      controller.abort();
    };
  }, [apiClient, historyId, retrySequence]);

  function retry() {
    setRetrySequence((current) => current + 1);
  }

  return { screenState, detail, retry };
}
