import { Link } from 'react-router-dom';

import type { TechnologyHistoryModel } from '../model/sharedHistory.ts';
import styles from './SharedHistoryList.module.css';

export interface SharedHistoryListProps {
  result: TechnologyHistoryModel;
}

export function SharedHistoryList({ result }: SharedHistoryListProps) {
  return (
    <section className={styles.result} aria-labelledby="shared-history-result-heading">
      <p className="visuallyHidden" role="status" aria-live="polite">
        {result.technologyName}の共有履歴を{result.sharedHistories.length}件読み込みました。
      </p>
      <h2 id="shared-history-result-heading">「{result.technologyName}」の共有履歴</h2>
      <ul className={styles.list} aria-label={`${result.technologyName}の共有履歴`}>
        {result.sharedHistories.map((history) => (
          <li key={history.historyId}>
            <Link className={styles.itemLink} to={`/shared-histories/${history.historyId}`}>
              <dl className={styles.summary}>
                <div>
                  <dt>保存日時</dt>
                  <dd>
                    <time dateTime={history.createdAt}>{history.createdAtLabel}</time>
                  </dd>
                </div>
                <div>
                  <dt>難易度</dt>
                  <dd>{history.difficultyLabel}</dd>
                </div>
                <div>
                  <dt>取り組める時間</dt>
                  <dd>{history.durationHours}時間</dd>
                </div>
                <div>
                  <dt>目的</dt>
                  <dd>{history.purposeLabel}</dd>
                </div>
              </dl>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
