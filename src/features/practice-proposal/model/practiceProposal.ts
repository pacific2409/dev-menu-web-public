import type { components } from '../../../generated/api/proposal-service.d.ts';

export type DifficultyCode = components['schemas']['Difficulty'];
export type PurposeCode = components['schemas']['Purpose'];
export type PracticeProposalRequest = components['schemas']['PracticeProposalRequest'];

export const PROPOSAL_FIELD_ORDER = [
  'technologyName',
  'difficulty',
  'durationHours',
  'purpose',
  'additionalPreference',
] as const;

export type ProposalField = (typeof PROPOSAL_FIELD_ORDER)[number];

export interface ProposalFormValues {
  technologyName: string;
  difficulty: string;
  durationHours: string;
  purpose: string;
  additionalPreference: string;
}

export type ProposalFormErrors = Partial<Record<ProposalField, string>>;

export interface NormalizedProposalConditions {
  technologyName: string;
  difficulty: DifficultyCode;
  durationHours: number;
  purpose: PurposeCode;
  additionalPreference: string | null;
}

export type ProposalConditionsModel = NormalizedProposalConditions;

export interface PracticeProposalModel {
  proposalNumber: 1 | 2 | 3;
  title: string;
  overview: string;
  achievementGoal: string;
  practiceFocus: string;
}

export interface PracticeProposalResultModel {
  conditions: ProposalConditionsModel;
  practiceProposals: [PracticeProposalModel, PracticeProposalModel, PracticeProposalModel];
}

export const INITIAL_PROPOSAL_FORM_VALUES: ProposalFormValues = {
  technologyName: '',
  difficulty: '',
  durationHours: '',
  purpose: '',
  additionalPreference: '',
};

export const DIFFICULTY_LABELS: Readonly<Record<DifficultyCode, string>> = {
  '1': '初級',
  '2': '中級',
  '3': '上級',
};

export const DIFFICULTY_GUIDES: Readonly<Record<DifficultyCode, string>> = {
  '1': '手がかりを参照しながら、単純で明確な課題に取り組む。',
  '2': '複数の要素を組み合わせ、明確な課題を自力で解決する。',
  '3': '複雑な課題で複数の選択肢を評価し、自力で設計・実施する。',
};

export const PURPOSE_LABELS: Readonly<Record<PurposeCode, string>> = {
  '1': '技術習得',
  '2': 'PoC',
};

export const GENERIC_PROPOSAL_ERROR_MESSAGE =
  '課題を提案できませんでした。時間をおいて、もう一度お試しください。';

export const GENERATION_PROPOSAL_ERROR_MESSAGE =
  '条件に合う課題を提案できませんでした。条件を変えて、もう一度お試しください。';
