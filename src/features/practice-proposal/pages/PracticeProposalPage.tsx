import { useEffect, useRef, useState } from 'react';
import { NavigationType, useNavigationType } from 'react-router-dom';

import {
  practiceProposalApiClient,
  type PracticeProposalApiClient,
} from '../api/practiceProposalApi.ts';
import {
  PracticeProposalForm,
  type ProposalFieldElement,
} from '../components/PracticeProposalForm.tsx';
import { ProposalResult } from '../components/ProposalResult.tsx';
import { usePracticeProposal, type ProposalFocusTarget } from '../hooks/usePracticeProposal.ts';
import type { ProposalField } from '../model/practiceProposal.ts';
import styles from './PracticeProposalPage.module.css';

interface PracticeProposalPageProps {
  apiClient?: PracticeProposalApiClient;
}

interface PendingFocus {
  target: ProposalFocusTarget;
  sequence: number;
}

export function PracticeProposalPage({
  apiClient = practiceProposalApiClient,
}: PracticeProposalPageProps) {
  const navigationType = useNavigationType();
  const initialNavigationTypeRef = useRef(navigationType);
  const pageTitleRef = useRef<HTMLHeadingElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const apiErrorRef = useRef<HTMLDivElement>(null);
  const fieldElementsRef = useRef(new Map<ProposalField, ProposalFieldElement>());
  const isMountedRef = useRef(true);
  const [pendingFocus, setPendingFocus] = useState<PendingFocus>();
  const proposal = usePracticeProposal(apiClient);

  useEffect(() => {
    isMountedRef.current = true;
    document.title = '課題を注文 | Dev Menu';
    if (initialNavigationTypeRef.current !== NavigationType.Pop) {
      pageTitleRef.current?.focus();
    }
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (pendingFocus === undefined) {
      return;
    }

    const { target } = pendingFocus;
    switch (target.kind) {
      case 'field':
        fieldElementsRef.current.get(target.field)?.focus();
        break;
      case 'result':
        resultHeadingRef.current?.focus();
        break;
      case 'api-error':
        apiErrorRef.current?.focus();
        break;
      case 'none':
        break;
    }
  }, [pendingFocus]);

  async function handleSubmit() {
    const target = await proposal.submit();
    if (!isMountedRef.current) {
      return;
    }
    setPendingFocus((currentFocus) => ({
      target,
      sequence: (currentFocus?.sequence ?? 0) + 1,
    }));
  }

  function handleFieldElement(field: ProposalField, element: ProposalFieldElement | null) {
    if (element === null) {
      fieldElementsRef.current.delete(field);
      return;
    }
    fieldElementsRef.current.set(field, element);
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 ref={pageTitleRef} tabIndex={-1}>
          課題を注文
        </h1>
        <p>学びたい技術と条件を入力すると、3つの実装課題を提案します。</p>
      </header>

      <section className={styles.formPanel} aria-label="課題の注文条件">
        <PracticeProposalForm
          values={proposal.values}
          errors={proposal.errors}
          isValidationSummaryVisible={proposal.isValidationSummaryVisible}
          isSubmitting={proposal.isSubmitting}
          onFieldElement={handleFieldElement}
          onFieldChange={proposal.updateField}
          onFieldBlur={proposal.validateField}
          onSubmit={() => {
            void handleSubmit();
          }}
        />
      </section>

      <p className="visuallyHidden" role="status" aria-live="polite">
        {proposal.isResultAnnouncementVisible ? '3件の課題を提案しました。' : ''}
      </p>

      {proposal.isSubmitting && (
        <div className={styles.loadingStatus} role="status" aria-live="polite">
          <span className={styles.loadingDot} aria-hidden="true" />
          <p>課題を考えています。しばらくお待ちください。</p>
        </div>
      )}

      {proposal.apiErrorMessage !== undefined && (
        <div ref={apiErrorRef} className={styles.apiError} role="alert" tabIndex={-1}>
          <p>{proposal.apiErrorMessage}</p>
        </div>
      )}

      {proposal.result !== undefined && (
        <ProposalResult
          result={proposal.result}
          isPreviousResult={proposal.isResultPrevious}
          headingRef={resultHeadingRef}
        />
      )}
    </div>
  );
}
