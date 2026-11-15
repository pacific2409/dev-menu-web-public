import type { SharedHistoryDetailModel } from '../model/sharedHistory.ts';
import styles from './SharedHistoryDetail.module.css';

interface SharedHistoryDetailProps {
  detail: SharedHistoryDetailModel;
}

export function SharedHistoryDetail({ detail }: SharedHistoryDetailProps) {
  const { conditions, practiceProposals } = detail;
  const practiceFocusLabel = conditions.purpose === '1' ? '学ぶポイント' : '検証するポイント';

  return (
    <section className={styles.detail} aria-labelledby="history-detail-heading">
      <header className={styles.detailHeader}>
        <h2 id="history-detail-heading">提案された課題</h2>
        <p>
          保存日時：<time dateTime={detail.createdAt}>{detail.createdAtLabel}</time>
        </p>
      </header>

      <section className={styles.conditions} aria-labelledby="history-conditions-heading">
        <h3 id="history-conditions-heading">生成条件</h3>
        <dl className={styles.conditionList}>
          <div>
            <dt>技術</dt>
            <dd>{conditions.technologyName}</dd>
          </div>
          <div>
            <dt>難易度</dt>
            <dd>{conditions.difficultyLabel}</dd>
          </div>
          <div>
            <dt>取り組める時間</dt>
            <dd>{conditions.durationHours}時間</dd>
          </div>
          <div>
            <dt>目的</dt>
            <dd>{conditions.purposeLabel}</dd>
          </div>
          <div className={styles.fullCondition}>
            <dt>その他の希望</dt>
            <dd className={styles.preserveText}>{conditions.additionalPreference ?? '指定なし'}</dd>
          </div>
        </dl>
      </section>

      <ol className={styles.proposalList} aria-label="保存された3件の課題">
        {practiceProposals.map((proposal) => (
          <li className={styles.proposalCard} key={proposal.proposalNumber}>
            <p className={styles.proposalNumber}>提案{proposal.proposalNumber}</p>
            <h3>{proposal.title}</h3>
            <dl className={styles.proposalDetails}>
              <div>
                <dt>概要</dt>
                <dd>{proposal.overview}</dd>
              </div>
              <div>
                <dt>達成目標</dt>
                <dd>{proposal.achievementGoal}</dd>
              </div>
              <div>
                <dt>{practiceFocusLabel}</dt>
                <dd>{proposal.practiceFocus}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ol>
    </section>
  );
}
