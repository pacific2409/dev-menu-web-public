import { countCodePoints, normalizeAdditionalPreference } from '../model/proposalValidation.ts';
import {
  DIFFICULTY_GUIDES,
  DIFFICULTY_LABELS,
  PROPOSAL_FIELD_ORDER,
  PURPOSE_LABELS,
  type DifficultyCode,
  type ProposalField,
  type ProposalFormErrors,
  type ProposalFormValues,
  type PurposeCode,
} from '../model/practiceProposal.ts';
import styles from './PracticeProposalForm.module.css';

export type ProposalFieldElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

interface PracticeProposalFormProps {
  values: ProposalFormValues;
  errors: ProposalFormErrors;
  isValidationSummaryVisible: boolean;
  isSubmitting: boolean;
  onFieldElement: (field: ProposalField, element: ProposalFieldElement | null) => void;
  onFieldChange: (field: ProposalField, value: string) => void;
  onFieldBlur: (field: ProposalField) => void;
  onSubmit: () => void;
}

function joinDescriptionIds(...ids: (string | undefined)[]) {
  const definedIds = ids.filter((id): id is string => id !== undefined);
  return definedIds.length === 0 ? undefined : definedIds.join(' ');
}

function FieldError({ field, errors }: { field: ProposalField; errors: ProposalFormErrors }) {
  const error = errors[field];
  return error === undefined ? null : (
    <p className={styles.fieldError} id={`${field}-error`}>
      {error}
    </p>
  );
}

function ValidationSummary({ errors }: { errors: ProposalFormErrors }) {
  const visibleErrors = PROPOSAL_FIELD_ORDER.flatMap((field) => {
    const error = errors[field];
    return error === undefined ? [] : [{ field, error }];
  });

  return (
    <section className={styles.validationSummary} role="alert" aria-label="入力エラー">
      <p className={styles.validationSummaryTitle}>入力内容を確認してください。</p>
      <ul>
        {visibleErrors.map(({ field, error }) => (
          <li key={field}>{error}</li>
        ))}
      </ul>
    </section>
  );
}

export function PracticeProposalForm({
  values,
  errors,
  isValidationSummaryVisible,
  isSubmitting,
  onFieldElement,
  onFieldChange,
  onFieldBlur,
  onSubmit,
}: PracticeProposalFormProps) {
  const difficulty = values.difficulty as DifficultyCode;
  const additionalPreferenceCount = countCodePoints(
    normalizeAdditionalPreference(values.additionalPreference),
  );

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      noValidate
    >
      {isValidationSummaryVisible && <ValidationSummary errors={errors} />}

      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="technologyName">
          学びたい技術<span className={styles.requiredLabel}>必須</span>
        </label>
        <input
          ref={(element) => {
            onFieldElement('technologyName', element);
          }}
          className={styles.control}
          id="technologyName"
          name="technologyName"
          type="text"
          value={values.technologyName}
          disabled={isSubmitting}
          aria-invalid={errors.technologyName === undefined ? undefined : true}
          aria-describedby={joinDescriptionIds(
            'technologyName-help',
            errors.technologyName === undefined ? undefined : 'technologyName-error',
          )}
          onChange={(event) => {
            onFieldChange('technologyName', event.currentTarget.value);
          }}
          onBlur={() => {
            onFieldBlur('technologyName');
          }}
        />
        <p className={styles.helperText} id="technologyName-help">
          例：React
        </p>
        <FieldError field="technologyName" errors={errors} />
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="difficulty">
          難易度<span className={styles.requiredLabel}>必須</span>
        </label>
        <select
          ref={(element) => {
            onFieldElement('difficulty', element);
          }}
          className={styles.control}
          id="difficulty"
          name="difficulty"
          value={values.difficulty}
          disabled={isSubmitting}
          aria-invalid={errors.difficulty === undefined ? undefined : true}
          aria-describedby={joinDescriptionIds(
            values.difficulty === '' ? undefined : 'difficulty-guide',
            errors.difficulty === undefined ? undefined : 'difficulty-error',
          )}
          onChange={(event) => {
            onFieldChange('difficulty', event.currentTarget.value);
          }}
          onBlur={() => {
            onFieldBlur('difficulty');
          }}
        >
          <option value="" disabled>
            選択してください
          </option>
          {(Object.entries(DIFFICULTY_LABELS) as [DifficultyCode, string][]).map(
            ([code, label]) => (
              <option value={code} key={code}>
                {label}
              </option>
            ),
          )}
        </select>
        {values.difficulty !== '' && (
          <p className={styles.guideText} id="difficulty-guide">
            {DIFFICULTY_GUIDES[difficulty]}
          </p>
        )}
        <FieldError field="difficulty" errors={errors} />
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="durationHours">
          取り組める時間<span className={styles.requiredLabel}>必須</span>
        </label>
        <div className={styles.durationInput}>
          <input
            ref={(element) => {
              onFieldElement('durationHours', element);
            }}
            className={styles.control}
            id="durationHours"
            name="durationHours"
            type="number"
            min="1"
            max="999"
            step="1"
            value={values.durationHours}
            disabled={isSubmitting}
            aria-invalid={errors.durationHours === undefined ? undefined : true}
            aria-describedby={joinDescriptionIds(
              'durationHours-unit',
              errors.durationHours === undefined ? undefined : 'durationHours-error',
            )}
            onChange={(event) => {
              onFieldChange('durationHours', event.currentTarget.value);
            }}
            onBlur={() => {
              onFieldBlur('durationHours');
            }}
          />
          <span id="durationHours-unit">時間</span>
        </div>
        <FieldError field="durationHours" errors={errors} />
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="purpose">
          目的<span className={styles.requiredLabel}>必須</span>
        </label>
        <select
          ref={(element) => {
            onFieldElement('purpose', element);
          }}
          className={styles.control}
          id="purpose"
          name="purpose"
          value={values.purpose}
          disabled={isSubmitting}
          aria-invalid={errors.purpose === undefined ? undefined : true}
          aria-describedby={errors.purpose === undefined ? undefined : 'purpose-error'}
          onChange={(event) => {
            onFieldChange('purpose', event.currentTarget.value);
          }}
          onBlur={() => {
            onFieldBlur('purpose');
          }}
        >
          <option value="" disabled>
            選択してください
          </option>
          {(Object.entries(PURPOSE_LABELS) as [PurposeCode, string][]).map(([code, label]) => (
            <option value={code} key={code}>
              {label}
            </option>
          ))}
        </select>
        <FieldError field="purpose" errors={errors} />
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="additionalPreference">
          その他の希望<span className={styles.optionalLabel}>任意</span>
        </label>
        <textarea
          ref={(element) => {
            onFieldElement('additionalPreference', element);
          }}
          className={`${styles.control ?? ''} ${styles.textarea ?? ''}`}
          id="additionalPreference"
          name="additionalPreference"
          rows={5}
          value={values.additionalPreference}
          disabled={isSubmitting}
          aria-invalid={errors.additionalPreference === undefined ? undefined : true}
          aria-describedby={joinDescriptionIds(
            'additionalPreference-help',
            'additionalPreference-counter',
            errors.additionalPreference === undefined ? undefined : 'additionalPreference-error',
          )}
          onChange={(event) => {
            onFieldChange('additionalPreference', event.currentTarget.value);
          }}
          onBlur={() => {
            onFieldBlur('additionalPreference');
          }}
        />
        <div className={styles.textareaMeta}>
          <p className={styles.helperText} id="additionalPreference-help">
            取り組みたい内容や条件があれば、200文字以内で入力してください
          </p>
          <p className={styles.counter} id="additionalPreference-counter">
            {additionalPreferenceCount} / 200
          </p>
        </div>
        <FieldError field="additionalPreference" errors={errors} />
      </div>

      <aside className={styles.publicNotice} aria-label="公開について">
        <span className={styles.noticeMark} aria-hidden="true">
          公開
        </span>
        <p>入力した条件と生成された課題は、ログインなしで共有履歴から閲覧できます。</p>
      </aside>

      <button className={styles.submitButton} type="submit" disabled={isSubmitting}>
        課題を提案してもらう
      </button>
    </form>
  );
}
