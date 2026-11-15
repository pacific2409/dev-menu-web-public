/* eslint-disable react-hooks/set-state-in-effect -- This hook synchronizes an explicit screen state machine with router URL state and external request lifecycles. */
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { SharedHistoryApiClient } from '../api/sharedHistoryApi.ts';
import {
  isPublicId,
  type SharedHistoryScreenState,
  type TechnologyHistoryModel,
  type TechnologyModel,
} from '../model/sharedHistory.ts';

type TechnologyLoadState = 'loading' | 'success' | 'error';

export function useSharedHistory(apiClient: SharedHistoryApiClient) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [technologyLoadState, setTechnologyLoadState] = useState<TechnologyLoadState>('loading');
  const [technologies, setTechnologies] = useState<TechnologyModel[]>([]);
  const [screenState, setScreenState] = useState<SharedHistoryScreenState>('loading-technologies');
  const [historyResult, setHistoryResult] = useState<TechnologyHistoryModel>();
  const [technologyRetrySequence, setTechnologyRetrySequence] = useState(0);
  const [historyRetrySequence, setHistoryRetrySequence] = useState(0);
  const [isTechnologyRefreshPending, setIsTechnologyRefreshPending] = useState(false);
  const technologyRequestSequenceRef = useRef(0);
  const historyRequestSequenceRef = useRef(0);
  const invalidSelectionNoticeRef = useRef(false);
  const search = searchParams.toString();
  const technologyIdValues = searchParams.getAll('technologyId');
  const rawTechnologyId = technologyIdValues.length === 1 ? technologyIdValues[0] : undefined;
  const selectedTechnologyId = technologies.some(
    ({ technologyId }) => technologyId === rawTechnologyId,
  )
    ? (rawTechnologyId ?? '')
    : '';

  useEffect(() => {
    const controller = new AbortController();
    const requestSequence = technologyRequestSequenceRef.current + 1;
    technologyRequestSequenceRef.current = requestSequence;
    historyRequestSequenceRef.current += 1;
    setTechnologyLoadState('loading');
    setTechnologies([]);
    setHistoryResult(undefined);
    setScreenState('loading-technologies');

    async function loadTechnologies() {
      try {
        const result = await apiClient.listTechnologies(controller.signal);
        if (controller.signal.aborted || requestSequence !== technologyRequestSequenceRef.current) {
          return;
        }
        if (result.kind === 'generic-error') {
          setTechnologyLoadState('error');
          setScreenState('technology-load-error');
          return;
        }
        setTechnologies(result.technologies);
        setTechnologyLoadState('success');
        if (result.technologies.length === 0) {
          setScreenState('no-technologies');
        }
      } catch {
        if (controller.signal.aborted || requestSequence !== technologyRequestSequenceRef.current) {
          return;
        }
        setTechnologyLoadState('error');
        setScreenState('technology-load-error');
      }
    }

    void loadTechnologies();
    return () => {
      controller.abort();
    };
  }, [apiClient, technologyRetrySequence]);

  useEffect(() => {
    if (technologyLoadState !== 'success') {
      return;
    }
    if (technologies.length === 0) {
      setHistoryResult(undefined);
      setScreenState('no-technologies');
      return;
    }

    const currentSearchParams = new URLSearchParams(search);
    const currentTechnologyIds = currentSearchParams.getAll('technologyId');
    const currentTechnologyId =
      currentTechnologyIds.length === 1 ? currentTechnologyIds[0] : undefined;

    if (currentTechnologyId === undefined) {
      setHistoryResult(undefined);
      setScreenState(
        invalidSelectionNoticeRef.current ? 'invalid-selection' : 'awaiting-selection',
      );
      return;
    }

    if (
      !isPublicId(currentTechnologyId) ||
      !technologies.some(({ technologyId }) => technologyId === currentTechnologyId)
    ) {
      invalidSelectionNoticeRef.current = true;
      setHistoryResult(undefined);
      setScreenState('invalid-selection');
      currentSearchParams.delete('technologyId');
      setSearchParams(currentSearchParams, { replace: true });
      return;
    }
    const validatedTechnologyId = currentTechnologyId;

    const controller = new AbortController();
    const requestSequence = historyRequestSequenceRef.current + 1;
    historyRequestSequenceRef.current = requestSequence;
    invalidSelectionNoticeRef.current = false;
    setHistoryResult(undefined);
    setScreenState('loading-histories');

    async function loadHistories() {
      try {
        const result = await apiClient.listHistories(validatedTechnologyId, controller.signal);
        if (controller.signal.aborted || requestSequence !== historyRequestSequenceRef.current) {
          return;
        }
        if (result.kind === 'invalid-selection') {
          invalidSelectionNoticeRef.current = true;
          setHistoryResult(undefined);
          setScreenState('invalid-selection');
          const nextSearchParams = new URLSearchParams(search);
          nextSearchParams.delete('technologyId');
          setSearchParams(nextSearchParams, { replace: true });
          setIsTechnologyRefreshPending(true);
          return;
        }
        if (result.kind === 'generic-error') {
          setHistoryResult(undefined);
          setScreenState('history-load-error');
          return;
        }
        setHistoryResult(result.result);
        setScreenState(result.result.sharedHistories.length === 0 ? 'empty' : 'result');
      } catch {
        if (controller.signal.aborted || requestSequence !== historyRequestSequenceRef.current) {
          return;
        }
        setHistoryResult(undefined);
        setScreenState('history-load-error');
      }
    }

    void loadHistories();
    return () => {
      controller.abort();
    };
  }, [apiClient, historyRetrySequence, search, setSearchParams, technologies, technologyLoadState]);

  useEffect(() => {
    if (!isTechnologyRefreshPending || new URLSearchParams(search).has('technologyId')) {
      return;
    }
    setIsTechnologyRefreshPending(false);
    setTechnologyRetrySequence((current) => current + 1);
  }, [isTechnologyRefreshPending, search]);

  function selectTechnology(technologyId: string) {
    if (technologyId === selectedTechnologyId) {
      return;
    }
    invalidSelectionNoticeRef.current = false;
    const nextSearchParams = new URLSearchParams(searchParams);
    if (technologyId.length === 0) {
      nextSearchParams.delete('technologyId');
    } else {
      nextSearchParams.set('technologyId', technologyId);
    }
    setSearchParams(nextSearchParams);
  }

  function retryTechnologies() {
    setTechnologyRetrySequence((current) => current + 1);
  }

  function retryHistories() {
    setHistoryRetrySequence((current) => current + 1);
  }

  return {
    screenState,
    technologies,
    selectedTechnologyId,
    historyResult,
    selectTechnology,
    retryTechnologies,
    retryHistories,
  };
}
