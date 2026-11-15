import type {
  DifficultyCode,
  NormalizedProposalConditions,
  PracticeProposalRequest,
  ProposalField,
  ProposalFormErrors,
  ProposalFormValues,
  PurposeCode,
} from './practiceProposal.ts';
import { PROPOSAL_FIELD_ORDER } from './practiceProposal.ts';

const TECHNOLOGY_NAME_MAX_LENGTH = 20;
const ADDITIONAL_PREFERENCE_MAX_LENGTH = 200;
const DURATION_HOURS_MIN = 1;
const DURATION_HOURS_MAX = 999;
const INTEGER_INPUT_PATTERN = /^\d+$/u;

export const FIELD_ERROR_MESSAGES: Readonly<Record<ProposalField, string>> = {
  technologyName: '学びたい技術を入力してください。',
  difficulty: '難易度を選択してください。',
  durationHours: '取り組める時間は1〜999の整数で入力してください。',
  purpose: '目的を選択してください。',
  additionalPreference: 'その他の希望は200文字以内で入力してください。',
};

export function countCodePoints(value: string) {
  return Array.from(value).length;
}

export function normalizeTechnologyName(value: string) {
  return value.trim().replace(/\s+/gu, ' ');
}

export function normalizeAdditionalPreference(value: string) {
  return value.trim();
}

function isDifficultyCode(value: string): value is DifficultyCode {
  return value === '1' || value === '2' || value === '3';
}

function isPurposeCode(value: string): value is PurposeCode {
  return value === '1' || value === '2';
}

function getTechnologyNameError(value: string) {
  const normalizedValue = normalizeTechnologyName(value);

  if (normalizedValue.length === 0) {
    return FIELD_ERROR_MESSAGES.technologyName;
  }

  if (countCodePoints(normalizedValue) > TECHNOLOGY_NAME_MAX_LENGTH) {
    return '学びたい技術は20文字以内で入力してください。';
  }

  return undefined;
}

function getDurationHoursError(value: string) {
  if (value.length === 0) {
    return '取り組める時間を入力してください。';
  }

  if (!INTEGER_INPUT_PATTERN.test(value)) {
    return FIELD_ERROR_MESSAGES.durationHours;
  }

  const durationHours = Number(value);
  if (
    !Number.isSafeInteger(durationHours) ||
    durationHours < DURATION_HOURS_MIN ||
    durationHours > DURATION_HOURS_MAX
  ) {
    return FIELD_ERROR_MESSAGES.durationHours;
  }

  return undefined;
}

export function getProposalFieldError(field: ProposalField, value: string) {
  switch (field) {
    case 'technologyName':
      return getTechnologyNameError(value);
    case 'difficulty':
      return isDifficultyCode(value) ? undefined : FIELD_ERROR_MESSAGES.difficulty;
    case 'durationHours':
      return getDurationHoursError(value);
    case 'purpose':
      return isPurposeCode(value) ? undefined : FIELD_ERROR_MESSAGES.purpose;
    case 'additionalPreference':
      return countCodePoints(normalizeAdditionalPreference(value)) <=
        ADDITIONAL_PREFERENCE_MAX_LENGTH
        ? undefined
        : FIELD_ERROR_MESSAGES.additionalPreference;
  }
}

export function validateProposalForm(values: ProposalFormValues): ProposalFormErrors {
  const fields = Object.keys(values) as ProposalField[];
  const errors: ProposalFormErrors = {};

  for (const field of fields) {
    const error = getProposalFieldError(field, values[field]);
    if (error !== undefined) {
      errors[field] = error;
    }
  }

  return errors;
}

export function hasProposalFormErrors(errors: ProposalFormErrors) {
  return PROPOSAL_FIELD_ORDER.some((field) => errors[field] !== undefined);
}

export function createProposalRequest(
  values: ProposalFormValues,
): PracticeProposalRequest & NormalizedProposalConditions {
  const difficulty = values.difficulty;
  const purpose = values.purpose;

  if (!isDifficultyCode(difficulty) || !isPurposeCode(purpose)) {
    throw new Error('Validated proposal form contains an invalid enum value.');
  }

  const normalizedPreference = normalizeAdditionalPreference(values.additionalPreference);

  return {
    technologyName: normalizeTechnologyName(values.technologyName),
    difficulty,
    durationHours: Number(values.durationHours),
    purpose,
    additionalPreference: normalizedPreference.length === 0 ? null : normalizedPreference,
  };
}
