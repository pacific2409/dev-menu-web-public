export const TECHNOLOGY_LOAD_ERROR_MESSAGE =
  '技術一覧を読み込めませんでした。時間をおいて、もう一度お試しください。';
export const HISTORY_LOAD_ERROR_MESSAGE =
  '共有履歴を読み込めませんでした。時間をおいて、もう一度お試しください。';
export const INVALID_SELECTION_MESSAGE =
  '選択した技術は見つかりませんでした。技術を選び直してください。';
export const INVALID_HISTORY_ID_MESSAGE = '指定されたURLが正しくありません。';
export const HISTORY_DETAIL_NOT_FOUND_MESSAGE = '指定された共有履歴は見つかりませんでした。';
export const HISTORY_DETAIL_LOAD_ERROR_MESSAGE =
  '共有履歴の詳細を読み込めませんでした。時間をおいて、もう一度お試しください。';

export type DifficultyCode = '1' | '2' | '3';
export type PurposeCode = '1' | '2';

export interface TechnologyModel {
  technologyId: string;
  technologyName: string;
}

export interface SharedHistorySummaryModel {
  historyId: string;
  createdAt: string;
  createdAtLabel: string;
  difficulty: DifficultyCode;
  difficultyLabel: '初級' | '中級' | '上級';
  durationHours: number;
  purpose: PurposeCode;
  purposeLabel: '技術習得' | 'PoC';
}

export interface TechnologyHistoryModel {
  technologyId: string;
  technologyName: string;
  sharedHistories: SharedHistorySummaryModel[];
}

export interface SharedHistoryProposalModel {
  proposalNumber: 1 | 2 | 3;
  title: string;
  overview: string;
  achievementGoal: string;
  practiceFocus: string;
}

export interface SharedHistoryDetailModel {
  historyId: string;
  createdAt: string;
  createdAtLabel: string;
  conditions: {
    technologyId: string;
    technologyName: string;
    difficulty: DifficultyCode;
    difficultyLabel: SharedHistorySummaryModel['difficultyLabel'];
    durationHours: number;
    purpose: PurposeCode;
    purposeLabel: SharedHistorySummaryModel['purposeLabel'];
    additionalPreference: string | null;
  };
  practiceProposals: SharedHistoryProposalModel[];
}

export type SharedHistoryDetailScreenState =
  'invalid-history-id' | 'loading' | 'success' | 'not-found' | 'load-error';

export type SharedHistoryScreenState =
  | 'loading-technologies'
  | 'technology-load-error'
  | 'no-technologies'
  | 'awaiting-selection'
  | 'loading-histories'
  | 'result'
  | 'empty'
  | 'history-load-error'
  | 'invalid-selection';

export const DIFFICULTY_LABELS: Record<
  DifficultyCode,
  SharedHistorySummaryModel['difficultyLabel']
> = {
  '1': '初級',
  '2': '中級',
  '3': '上級',
};

export const PURPOSE_LABELS: Record<PurposeCode, SharedHistorySummaryModel['purposeLabel']> = {
  '1': '技術習得',
  '2': 'PoC',
};

const MAX_PUBLIC_ID = '9223372036854775807';

export function isPublicId(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    return false;
  }
  return (
    value.length < MAX_PUBLIC_ID.length ||
    (value.length === MAX_PUBLIC_ID.length && value <= MAX_PUBLIC_ID)
  );
}

export function countCodePoints(value: string) {
  return Array.from(value).length;
}

export function isDisplayTechnologyName(value: unknown): value is string {
  return typeof value === 'string' && countCodePoints(value) >= 1 && countCodePoints(value) <= 20;
}

const UTC_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?Z$/;

export function isUtcDateTime(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const match = UTC_DATE_TIME_PATTERN.exec(value);
  if (match === null) {
    return false;
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  if (
    yearText === undefined ||
    monthText === undefined ||
    dayText === undefined ||
    hourText === undefined ||
    minuteText === undefined ||
    secondText === undefined
  ) {
    return false;
  }
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
  );
}

export function formatLocalDateTime(value: string) {
  const date = new Date(value);
  const minute = String(date.getMinutes()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  return `${String(date.getFullYear())}年${String(date.getMonth() + 1)}月${String(date.getDate())}日 ${hour}:${minute}`;
}
