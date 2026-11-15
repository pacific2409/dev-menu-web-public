import type { components } from '../../../generated/api/proposal-service.d.ts';
import {
  fetchJsonHttpClient,
  type JsonHttpClient,
  type JsonHttpResponse,
} from '../../../shared/api/jsonHttpClient.ts';
import { countCodePoints } from '../model/proposalValidation.ts';
import type {
  DifficultyCode,
  PracticeProposalModel,
  PracticeProposalRequest,
  PracticeProposalResultModel,
  ProposalField,
  PurposeCode,
} from '../model/practiceProposal.ts';

const PRACTICE_PROPOSALS_PATH = '/api/v1/practice-proposals';
const PROPOSAL_COUNT = 3;
const TECHNOLOGY_NAME_MAX_LENGTH = 20;
const ADDITIONAL_PREFERENCE_MAX_LENGTH = 200;
const PROPOSAL_TITLE_MAX_LENGTH = 100;
const PROPOSAL_TEXT_MAX_LENGTH = 500;
const DURATION_HOURS_MIN = 1;
const DURATION_HOURS_MAX = 999;

type PracticeProposalResponse = components['schemas']['PracticeProposalResponse'];

export type PracticeProposalApiResult =
  | { kind: 'success'; result: PracticeProposalResultModel }
  | { kind: 'validation-error'; fields: ProposalField[] }
  | { kind: 'generation-error' }
  | { kind: 'generic-error' };

export interface PracticeProposalApiClient {
  create(request: PracticeProposalRequest, signal: AbortSignal): Promise<PracticeProposalApiResult>;
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

function isBoundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function isBoundedDisplayString(value: unknown, maximumLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value === value.trim() &&
    countCodePoints(value) <= maximumLength
  );
}

function mapConditions(value: unknown): PracticeProposalResponse['conditions'] | undefined {
  const keys = ['technologyName', 'difficulty', 'durationHours', 'purpose', 'additionalPreference'];
  if (!isRecord(value) || !hasExactKeys(value, keys)) {
    return undefined;
  }

  const preference = value.additionalPreference;
  if (
    !isBoundedDisplayString(value.technologyName, TECHNOLOGY_NAME_MAX_LENGTH) ||
    !isDifficultyCode(value.difficulty) ||
    !isBoundedInteger(value.durationHours, DURATION_HOURS_MIN, DURATION_HOURS_MAX) ||
    !isPurposeCode(value.purpose) ||
    (preference !== null && !isBoundedDisplayString(preference, ADDITIONAL_PREFERENCE_MAX_LENGTH))
  ) {
    return undefined;
  }

  return {
    technologyName: value.technologyName,
    difficulty: value.difficulty,
    durationHours: value.durationHours,
    purpose: value.purpose,
    additionalPreference: preference,
  };
}

function mapProposal(value: unknown): PracticeProposalModel | undefined {
  const keys = ['proposalNumber', 'title', 'overview', 'achievementGoal', 'practiceFocus'];
  if (!isRecord(value) || !hasExactKeys(value, keys)) {
    return undefined;
  }

  if (
    !isBoundedInteger(value.proposalNumber, 1, PROPOSAL_COUNT) ||
    !isBoundedDisplayString(value.title, PROPOSAL_TITLE_MAX_LENGTH) ||
    !isBoundedDisplayString(value.overview, PROPOSAL_TEXT_MAX_LENGTH) ||
    !isBoundedDisplayString(value.achievementGoal, PROPOSAL_TEXT_MAX_LENGTH) ||
    !isBoundedDisplayString(value.practiceFocus, PROPOSAL_TEXT_MAX_LENGTH)
  ) {
    return undefined;
  }

  return {
    proposalNumber: value.proposalNumber as 1 | 2 | 3,
    title: value.title,
    overview: value.overview,
    achievementGoal: value.achievementGoal,
    practiceFocus: value.practiceFocus,
  };
}

function mapSuccessResponse(body: unknown): PracticeProposalResultModel | undefined {
  if (!isRecord(body) || !hasExactKeys(body, ['conditions', 'practiceProposals'])) {
    return undefined;
  }

  const conditions = mapConditions(body.conditions);
  if (
    conditions === undefined ||
    !Array.isArray(body.practiceProposals) ||
    body.practiceProposals.length !== PROPOSAL_COUNT
  ) {
    return undefined;
  }

  const proposals = body.practiceProposals.map(mapProposal);
  if (proposals.some((proposal) => proposal === undefined)) {
    return undefined;
  }

  const orderedProposals = [...(proposals as PracticeProposalModel[])].sort(
    (left, right) => left.proposalNumber - right.proposalNumber,
  );
  if (!orderedProposals.every((proposal, index) => proposal.proposalNumber === index + 1)) {
    return undefined;
  }

  return {
    conditions,
    practiceProposals: orderedProposals as [
      PracticeProposalModel,
      PracticeProposalModel,
      PracticeProposalModel,
    ],
  };
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

function mapValidationFields(body: unknown): ProposalField[] | undefined {
  if (!isRecord(body) || !hasExactKeys(body, ['errorCode', 'errorMessage', 'validationMessage'])) {
    return undefined;
  }
  if (
    typeof body.errorMessage !== 'string' ||
    body.errorMessage.length === 0 ||
    !isRecord(body.validationMessage)
  ) {
    return undefined;
  }

  const knownFields = new Set<ProposalField>([
    'technologyName',
    'difficulty',
    'durationHours',
    'purpose',
    'additionalPreference',
  ]);
  const entries = Object.entries(body.validationMessage);
  if (
    entries.length === 0 ||
    entries.some(
      ([field, message]) => !knownFields.has(field as ProposalField) || typeof message !== 'string',
    )
  ) {
    return undefined;
  }

  return entries.map(([field]) => field as ProposalField);
}

function mapErrorResponse(response: JsonHttpResponse): PracticeProposalApiResult {
  if (!response.isJson) {
    return { kind: 'generic-error' };
  }

  if (response.status === 400 && isRecord(response.body) && response.body.errorCode === 'VE0001') {
    const fields = mapValidationFields(response.body);
    return fields === undefined ? { kind: 'generic-error' } : { kind: 'validation-error', fields };
  }

  const errorCode = getErrorCode(response.body);
  if (response.status === 500 && errorCode === 'GAI001') {
    return { kind: 'generation-error' };
  }

  return { kind: 'generic-error' };
}

export function createPracticeProposalApiClient(
  httpClient: JsonHttpClient,
): PracticeProposalApiClient {
  return {
    async create(request, signal) {
      const response = await httpClient.request({
        path: PRACTICE_PROPOSALS_PATH,
        method: 'POST',
        body: request,
        signal,
      });

      if (response.status === 200 && response.isJson) {
        const result = mapSuccessResponse(response.body);
        return result === undefined ? { kind: 'generic-error' } : { kind: 'success', result };
      }

      return mapErrorResponse(response);
    },
  };
}

export const practiceProposalApiClient = createPracticeProposalApiClient(fetchJsonHttpClient);
