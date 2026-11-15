import type { RefObject } from 'react';

import {
  DIFFICULTY_LABELS,
  PURPOSE_LABELS,
  type PracticeProposalResultModel,
} from '../model/practiceProposal.ts';
import styles from './ProposalResult.module.css';

interface ProposalResultProps {
  result: PracticeProposalResultModel;
  isPreviousResult: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
}

export function ProposalResult({ result, isPreviousResult, headingRef }: ProposalResultProps) {
  const { conditions, practiceProposals } = result;
  const practiceFocusLabel = conditions.purpose === '1' ? '学ぶポイント' : '検証するポイント';

  return (
    <section className={styles.result} aria-labelledby="proposal-result-heading">
      <div className={styles.resultHeader}>
        <div>
          <h2 ref={headingRef} id="proposal-result-heading" tabIndex={-1}>
            提案された課題
          </h2>
        </div>
        {isPreviousResult && <p className={styles.previousLabel}>前回成功した提案</p>}
      </div>

      <section className={styles.conditions} aria-labelledby="conditions-heading">
        <h3 id="conditions-heading">生成条件</h3>
        <dl className={styles.conditionList}>
          <div>
            <dt>技術</dt>
            <dd>{conditions.technologyName}</dd>
          </div>
          <div>
            <dt>難易度</dt>
            <dd>{DIFFICULTY_LABELS[conditions.difficulty]}</dd>
          </div>
          <div>
            <dt>取り組める時間</dt>
            <dd>{conditions.durationHours}時間</dd>
          </div>
          <div>
            <dt>目的</dt>
            <dd>{PURPOSE_LABELS[conditions.purpose]}</dd>
          </div>
          <div className={styles.fullCondition}>
            <dt>その他の希望</dt>
            <dd className={styles.preserveText}>{conditions.additionalPreference ?? '指定なし'}</dd>
          </div>
        </dl>
      </section>

      <ol className={styles.proposalList} aria-label="提案された3件の課題">
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
