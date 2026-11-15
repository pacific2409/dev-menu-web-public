import type { components } from '../../../generated/api/proposal-service.d.ts';
import {
  fetchJsonHttpClient,
  type JsonHttpClient,
  type JsonHttpResponse,
} from '../../../shared/api/jsonHttpClient.ts';
import {
  DIFFICULTY_LABELS,
  formatLocalDateTime,
  isDisplayTechnologyName,
  isPublicId,
  isUtcDateTime,
  PURPOSE_LABELS,
  type DifficultyCode,
  type PurposeCode,
  type SharedHistoryDetailModel,
  type SharedHistoryProposalModel,
  type SharedHistorySummaryModel,
  type TechnologyHistoryModel,
  type TechnologyModel,
} from '../model/sharedHistory.ts';

const TECHNOLOGIES_PATH = '/api/v1/technologies';
const DURATION_HOURS_MIN = 1;
const DURATION_HOURS_MAX = 999;

type TechnologyListResponse = components['schemas']['TechnologyListResponse'];
type TechnologyHistoryListResponse = components['schemas']['TechnologyHistoryListResponse'];
type SharedHistoryDetailResponse = components['schemas']['SharedHistoryDetailResponse'];

export type TechnologyListApiResult =
  { kind: 'success'; technologies: TechnologyModel[] } | { kind: 'generic-error' };

export type TechnologyHistoryApiResult =
  | { kind: 'success'; result: TechnologyHistoryModel }
  | { kind: 'invalid-selection' }
  | { kind: 'generic-error' };

export type SharedHistoryDetailApiResult =
  | { kind: 'success'; result: SharedHistoryDetailModel }
  | { kind: 'invalid-history-id' }
  | { kind: 'not-found' }
  | { kind: 'generic-error' };

export interface SharedHistoryApiClient {
  listTechnologies(signal: AbortSignal): Promise<TechnologyListApiResult>;
  listHistories(technologyId: string, signal: AbortSignal): Promise<TechnologyHistoryApiResult>;
  getHistoryDetail(historyId: string, signal: AbortSignal): Promise<SharedHistoryDetailApiResult>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]) {
  const actualKeys = Object.keys(value);
  return actualKeys.length === expectedKeys.length && expectedKeys.every((key) => key in value);
}

function isDifficultyCode(value: unknown): value is DifficultyCode {
  return value === '1' || value === '2' || value === '3';
}

function isPurposeCode(value: unknown): value is PurposeCode {
  return value === '1' || value === '2';
}

function isDurationHours(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= DURATION_HOURS_MIN &&
    value <= DURATION_HOURS_MAX
  );
}

function mapTechnology(value: unknown): TechnologyModel | undefined {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['technologyId', 'technologyName']) ||
    !isPublicId(value.technologyId) ||
    !isDisplayTechnologyName(value.technologyName)
  ) {
    return undefined;
  }
  return {
    technologyId: value.technologyId,
    technologyName: value.technologyName,
  } satisfies TechnologyListResponse['technologies'][number];
}

function mapTechnologyList(body: unknown): TechnologyModel[] | undefined {
  if (
    !isRecord(body) ||
    !hasExactKeys(body, ['technologies']) ||
    !Array.isArray(body.technologies)
  ) {
    return undefined;
  }
  const technologies = body.technologies.map(mapTechnology);
  return technologies.some((technology) => technology === undefined)
    ? undefined
    : (technologies as TechnologyModel[]);
}

function mapHistory(value: unknown): SharedHistorySummaryModel | undefined {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['historyId', 'createdAt', 'difficulty', 'durationHours', 'purpose']) ||
    !isPublicId(value.historyId) ||
    !isUtcDateTime(value.createdAt) ||
    !isDifficultyCode(value.difficulty) ||
    !isDurationHours(value.durationHours) ||
    !isPurposeCode(value.purpose)
  ) {
    return undefined;
  }
  return {
    historyId: value.historyId,
    createdAt: value.createdAt,
    createdAtLabel: formatLocalDateTime(value.createdAt),
    difficulty: value.difficulty,
    difficultyLabel: DIFFICULTY_LABELS[value.difficulty],
    durationHours: value.durationHours,
    purpose: value.purpose,
    purposeLabel: PURPOSE_LABELS[value.purpose],
  };
}

function mapTechnologyHistory(
  body: unknown,
  selectedTechnologyId: string,
): TechnologyHistoryModel | undefined {
  if (
    !isRecord(body) ||
    !hasExactKeys(body, ['technologyId', 'technologyName', 'sharedHistories']) ||
    body.technologyId !== selectedTechnologyId ||
    !isPublicId(body.technologyId) ||
    !isDisplayTechnologyName(body.technologyName) ||
    !Array.isArray(body.sharedHistories)
  ) {
    return undefined;
  }
  const sharedHistories = body.sharedHistories.map(mapHistory);
  if (sharedHistories.some((history) => history === undefined)) {
    return undefined;
  }
  return {
    technologyId: body.technologyId,
    technologyName: body.technologyName,
    sharedHistories: sharedHistories as SharedHistorySummaryModel[],
  } satisfies TechnologyHistoryListResponse;
}

function getErrorCode(body: unknown) {
  if (
    !isRecord(body) ||
    !hasExactKeys(body, ['errorCode', 'errorMessage']) ||
    typeof body.errorCode !== 'string' ||
    typeof body.errorMessage !== 'string'
  ) {
    return undefined;
  }
  return body.errorCode;
}

function mapHistoryError(response: JsonHttpResponse): TechnologyHistoryApiResult {
  if (!response.isJson) {
    return { kind: 'generic-error' };
  }
  const errorCode = getErrorCode(response.body);
  if (
    (response.status === 400 && errorCode === 'REQ003') ||
    (response.status === 404 && errorCode === 'TEC001')
  ) {
    return { kind: 'invalid-selection' };
  }
  return { kind: 'generic-error' };
}

function isBoundedText(value: unknown, maximumLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && Array.from(value).length <= maximumLength;
}

function isBoundedNonBlankText(value: unknown, maximumLength: number): value is string {
  return isBoundedText(value, maximumLength) && value.trim().length > 0;
}

function mapDetailProposal(value: unknown): SharedHistoryProposalModel | undefined {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'proposalNumber',
      'title',
      'overview',
      'achievementGoal',
      'practiceFocus',
    ]) ||
    (value.proposalNumber !== 1 && value.proposalNumber !== 2 && value.proposalNumber !== 3) ||
    !isBoundedNonBlankText(value.title, 100) ||
    !isBoundedNonBlankText(value.overview, 500) ||
    !isBoundedNonBlankText(value.achievementGoal, 500) ||
    !isBoundedNonBlankText(value.practiceFocus, 500)
  ) {
    return undefined;
  }
  return {
    proposalNumber: value.proposalNumber,
    title: value.title,
    overview: value.overview,
    achievementGoal: value.achievementGoal,
    practiceFocus: value.practiceFocus,
  };
}

function mapHistoryDetail(
  body: unknown,
  requestedHistoryId: string,
): SharedHistoryDetailModel | undefined {
  if (
    !isRecord(body) ||
    !hasExactKeys(body, ['historyId', 'createdAt', 'conditions', 'practiceProposals']) ||
    body.historyId !== requestedHistoryId ||
    !isPublicId(body.historyId) ||
    !isUtcDateTime(body.createdAt) ||
    !isRecord(body.conditions) ||
    !hasExactKeys(body.conditions, [
      'technologyId',
      'technologyName',
      'difficulty',
      'durationHours',
      'purpose',
      'additionalPreference',
    ]) ||
    !isPublicId(body.conditions.technologyId) ||
    !isDisplayTechnologyName(body.conditions.technologyName) ||
    !isDifficultyCode(body.conditions.difficulty) ||
    !isDurationHours(body.conditions.durationHours) ||
    !isPurposeCode(body.conditions.purpose) ||
    (body.conditions.additionalPreference !== null &&
      !isBoundedText(body.conditions.additionalPreference, 200)) ||
    !Array.isArray(body.practiceProposals) ||
    body.practiceProposals.length !== 3
  ) {
    return undefined;
  }

  const practiceProposals = body.practiceProposals.map(mapDetailProposal);
  if (
    practiceProposals.some((proposal) => proposal === undefined) ||
    new Set(practiceProposals.map((proposal) => proposal?.proposalNumber)).size !== 3
  ) {
    return undefined;
  }
  const sortedProposals = [...(practiceProposals as SharedHistoryProposalModel[])].sort(
    (left, right) => left.proposalNumber - right.proposalNumber,
  );

  return {
    historyId: body.historyId,
    createdAt: body.createdAt,
    createdAtLabel: formatLocalDateTime(body.createdAt),
    conditions: {
      technologyId: body.conditions.technologyId,
      technologyName: body.conditions.technologyName,
      difficulty: body.conditions.difficulty,
      difficultyLabel: DIFFICULTY_LABELS[body.conditions.difficulty],
      durationHours: body.conditions.durationHours,
      purpose: body.conditions.purpose,
      purposeLabel: PURPOSE_LABELS[body.conditions.purpose],
      additionalPreference: body.conditions.additionalPreference,
    },
    practiceProposals: sortedProposals,
  } satisfies SharedHistoryDetailModel & SharedHistoryDetailResponse;
}

function mapDetailError(response: JsonHttpResponse): SharedHistoryDetailApiResult {
  if (!response.isJson) {
    return { kind: 'generic-error' };
  }
  const errorCode = getErrorCode(response.body);
  if (response.status === 400 && errorCode === 'REQ003') {
    return { kind: 'invalid-history-id' };
  }
  if (response.status === 404 && errorCode === 'SH0001') {
    return { kind: 'not-found' };
  }
  return { kind: 'generic-error' };
}

export function createSharedHistoryApiClient(httpClient: JsonHttpClient): SharedHistoryApiClient {
  return {
    async listTechnologies(signal) {
      const response = await httpClient.request({
        path: TECHNOLOGIES_PATH,
        method: 'GET',
        signal,
      });
      if (response.status !== 200 || !response.isJson) {
        return { kind: 'generic-error' };
      }
      const technologies = mapTechnologyList(response.body);
      return technologies === undefined
        ? { kind: 'generic-error' }
        : { kind: 'success', technologies };
    },

    async listHistories(technologyId, signal) {
      const response = await httpClient.request({
        path: `/api/v1/technologies/${technologyId}/shared-histories`,
        method: 'GET',
        signal,
      });
      if (response.status === 200 && response.isJson) {
        const result = mapTechnologyHistory(response.body, technologyId);
        return result === undefined ? { kind: 'generic-error' } : { kind: 'success', result };
      }
      return mapHistoryError(response);
    },

    async getHistoryDetail(historyId, signal) {
      const response = await httpClient.request({
        path: `/api/v1/shared-histories/${encodeURIComponent(historyId)}`,
        method: 'GET',
        signal,
      });
      if (response.status === 200 && response.isJson) {
        const result = mapHistoryDetail(response.body, historyId);
        return result === undefined ? { kind: 'generic-error' } : { kind: 'success', result };
      }
      return mapDetailError(response);
    },
  };
}

export const sharedHistoryApiClient = createSharedHistoryApiClient(fetchJsonHttpClient);
