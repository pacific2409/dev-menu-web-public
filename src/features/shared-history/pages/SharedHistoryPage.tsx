import { useEffect, useRef } from 'react';
import { NavigationType, useNavigationType } from 'react-router-dom';

import { sharedHistoryApiClient, type SharedHistoryApiClient } from '../api/sharedHistoryApi.ts';
import { SharedHistoryList } from '../components/SharedHistoryList.tsx';
import { useSharedHistory } from '../hooks/useSharedHistory.ts';
import {
  HISTORY_LOAD_ERROR_MESSAGE,
  INVALID_SELECTION_MESSAGE,
  TECHNOLOGY_LOAD_ERROR_MESSAGE,
} from '../model/sharedHistory.ts';
import styles from './SharedHistoryPage.module.css';

export interface SharedHistoryPageProps {
  apiClient?: SharedHistoryApiClient;
}

export function SharedHistoryPage({ apiClient = sharedHistoryApiClient }: SharedHistoryPageProps) {
  const pageTitleRef = useRef<HTMLHeadingElement>(null);
  const technologySelectRef = useRef<HTMLSelectElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const navigationType = useNavigationType();
  const initialNavigationTypeRef = useRef(navigationType);
  const history = useSharedHistory(apiClient);
  const previousScreenStateRef = useRef(history.screenState);
  const isTechnologySelectDisabled =
    history.screenState === 'loading-technologies' ||
    history.screenState === 'technology-load-error' ||
    history.screenState === 'no-technologies' ||
    history.screenState === 'loading-histories';

  useEffect(() => {
    document.title = '共有履歴 | Dev Menu';
    if (initialNavigationTypeRef.current !== NavigationType.Pop) {
      pageTitleRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    if (
      history.screenState === 'technology-load-error' ||
      history.screenState === 'history-load-error' ||
      history.screenState === 'invalid-selection'
    ) {
      feedbackRef.current?.focus();
    }
  }, [history.screenState]);

  useEffect(() => {
    const previousScreenState = previousScreenStateRef.current;
    previousScreenStateRef.current = history.screenState;
    if (
      previousScreenState === 'loading-histories' &&
      (history.screenState === 'result' || history.screenState === 'empty') &&
      (document.activeElement === null || document.activeElement === document.body)
    ) {
      technologySelectRef.current?.focus();
    }
  }, [history.screenState]);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 ref={pageTitleRef} tabIndex={-1}>
          共有履歴
        </h1>
        <p>これまでに生成された課題を、技術ごとに確認できます。</p>
      </header>

      <section className={styles.filterPanel} aria-label="技術フィルター">
        <label className={styles.field}>
          <span>技術</span>
          <select
            ref={technologySelectRef}
            value={history.selectedTechnologyId}
            disabled={isTechnologySelectDisabled}
            onChange={(event) => {
              history.selectTechnology(event.currentTarget.value);
            }}
          >
            <option value="">技術を選択してください</option>
            {history.technologies.map((technology) => (
              <option key={technology.technologyId} value={technology.technologyId}>
                {technology.technologyName}
              </option>
            ))}
          </select>
        </label>
      </section>

      {history.screenState !== 'awaiting-selection' && (
        <section className={styles.historyPanel} aria-label="共有履歴の取得結果">
          {history.screenState === 'loading-technologies' && (
            <div className={styles.loadingStatus} role="status" aria-live="polite">
              <span className={styles.loadingDot} aria-hidden="true" />
              <p>技術を読み込んでいます。</p>
            </div>
          )}

          {history.screenState === 'loading-histories' && (
            <div className={styles.loadingStatus} role="status" aria-live="polite">
              <span className={styles.loadingDot} aria-hidden="true" />
              <p>共有履歴を読み込んでいます。</p>
            </div>
          )}

          {history.screenState === 'technology-load-error' && (
            <div ref={feedbackRef} className={styles.error} role="alert" tabIndex={-1}>
              <p>{TECHNOLOGY_LOAD_ERROR_MESSAGE}</p>
              <button type="button" onClick={history.retryTechnologies}>
                もう一度読み込む
              </button>
            </div>
          )}

          {history.screenState === 'history-load-error' && (
            <div ref={feedbackRef} className={styles.error} role="alert" tabIndex={-1}>
              <p>{HISTORY_LOAD_ERROR_MESSAGE}</p>
              <button type="button" onClick={history.retryHistories}>
                もう一度読み込む
              </button>
            </div>
          )}

          {history.screenState === 'invalid-selection' && (
            <div ref={feedbackRef} className={styles.invalid} role="alert" tabIndex={-1}>
              <p>{INVALID_SELECTION_MESSAGE}</p>
            </div>
          )}

          {history.screenState === 'no-technologies' && (
            <p className={styles.empty} role="status">
              共有履歴のある技術はまだありません。
            </p>
          )}

          {history.screenState === 'empty' && (
            <p className={styles.empty} role="status">
              この技術の共有履歴はありません。
            </p>
          )}

          {history.screenState === 'result' && history.historyResult !== undefined && (
            <SharedHistoryList result={history.historyResult} />
          )}
        </section>
      )}
    </div>
  );
}
