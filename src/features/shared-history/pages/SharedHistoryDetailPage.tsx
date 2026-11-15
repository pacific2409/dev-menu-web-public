import { useEffect, useRef } from 'react';
import { Link, NavigationType, useNavigationType, useParams } from 'react-router-dom';

import { sharedHistoryApiClient, type SharedHistoryApiClient } from '../api/sharedHistoryApi.ts';
import { SharedHistoryDetail } from '../components/SharedHistoryDetail.tsx';
import { useSharedHistoryDetail } from '../hooks/useSharedHistoryDetail.ts';
import {
  HISTORY_DETAIL_LOAD_ERROR_MESSAGE,
  HISTORY_DETAIL_NOT_FOUND_MESSAGE,
  INVALID_HISTORY_ID_MESSAGE,
} from '../model/sharedHistory.ts';
import styles from './SharedHistoryDetailPage.module.css';

interface SharedHistoryDetailPageProps {
  apiClient?: SharedHistoryApiClient;
}

export function SharedHistoryDetailPage({
  apiClient = sharedHistoryApiClient,
}: SharedHistoryDetailPageProps) {
  const { historyId } = useParams<{ historyId: string }>();
  const navigationType = useNavigationType();
  const initialNavigationTypeRef = useRef(navigationType);
  const pageTitleRef = useRef<HTMLHeadingElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const history = useSharedHistoryDetail(historyId, apiClient);
  const listPath =
    history.screenState === 'success' && history.detail !== undefined
      ? `/shared-histories?technologyId=${encodeURIComponent(history.detail.conditions.technologyId)}`
      : '/shared-histories';

  useEffect(() => {
    document.title = '共有履歴の詳細 | Dev Menu';
    if (initialNavigationTypeRef.current !== NavigationType.Pop) {
      pageTitleRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    if (
      history.screenState === 'invalid-history-id' ||
      history.screenState === 'not-found' ||
      history.screenState === 'load-error'
    ) {
      feedbackRef.current?.focus();
    }
  }, [history.screenState]);

  const actions = (
    <nav className={styles.actions} aria-label="共有履歴の詳細操作">
      <Link to={listPath}>共有履歴へ戻る</Link>
      <Link className={styles.primaryAction} to="/">
        新しい課題を注文する
      </Link>
    </nav>
  );

  return (
    <div className={styles.page}>
      <Link className={styles.backLink} to={listPath}>
        共有履歴へ戻る
      </Link>

      <header className={styles.pageHeader}>
        <h1 ref={pageTitleRef} tabIndex={-1}>
          共有履歴の詳細
        </h1>
        <p>保存された生成条件と3つの課題を確認できます。</p>
      </header>

      {history.screenState === 'loading' && (
        <div className={styles.loadingStatus} role="status" aria-live="polite">
          <span className={styles.loadingDot} aria-hidden="true" />
          <p>共有履歴の詳細を読み込んでいます。</p>
        </div>
      )}

      {history.screenState === 'invalid-history-id' && (
        <>
          <div ref={feedbackRef} className={styles.feedback} role="alert" tabIndex={-1}>
            {INVALID_HISTORY_ID_MESSAGE}
          </div>
          {actions}
        </>
      )}

      {history.screenState === 'not-found' && (
        <>
          <div ref={feedbackRef} className={styles.feedback} role="alert" tabIndex={-1}>
            {HISTORY_DETAIL_NOT_FOUND_MESSAGE}
          </div>
          {actions}
        </>
      )}

      {history.screenState === 'load-error' && (
        <>
          <div ref={feedbackRef} className={styles.feedback} role="alert" tabIndex={-1}>
            <p>{HISTORY_DETAIL_LOAD_ERROR_MESSAGE}</p>
            <button type="button" onClick={history.retry}>
              もう一度読み込む
            </button>
          </div>
          {actions}
        </>
      )}

      {history.screenState === 'success' && history.detail !== undefined && (
        <>
          <p className={styles.successStatus} role="status" aria-live="polite">
            共有履歴の詳細を読み込みました。
          </p>
          <SharedHistoryDetail detail={history.detail} />
          {actions}
        </>
      )}
    </div>
  );
}
