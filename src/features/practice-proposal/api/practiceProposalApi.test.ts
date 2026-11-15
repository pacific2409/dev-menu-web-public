import { describe, expect, it } from 'vitest';

import type {
  JsonHttpClient,
  JsonHttpRequest,
  JsonHttpResponse,
} from '../../../shared/api/jsonHttpClient.ts';
import type { PracticeProposalRequest } from '../model/practiceProposal.ts';
import { createPracticeProposalApiClient } from './practiceProposalApi.ts';

const requestBody: PracticeProposalRequest = {
  technologyName: 'React',
  difficulty: '2',
  durationHours: 12,
  purpose: '1',
  additionalPreference: null,
};

function successBody() {
  return {
    conditions: { ...requestBody },
    practiceProposals: [3, 1, 2].map((proposalNumber) => ({
      proposalNumber,
      title: `課題${String(proposalNumber)}`,
      overview: `概要${String(proposalNumber)}`,
      achievementGoal: `目標${String(proposalNumber)}`,
      practiceFocus: `ポイント${String(proposalNumber)}`,
    })),
  };
}

function clientFor(response: JsonHttpResponse, requests: JsonHttpRequest[] = []) {
  const httpClient: JsonHttpClient = {
    request(request) {
      requests.push(request);
      return Promise.resolve(response);
    },
  };
  return createPracticeProposalApiClient(httpClient);
}

describe('practiceProposalApi', () => {
  it('posts the exact request and maps a valid response in proposal-number order', async () => {
    const requests: JsonHttpRequest[] = [];
    const controller = new AbortController();
    const result = await clientFor(
      { status: 200, isJson: true, body: successBody() },
      requests,
    ).create(requestBody, controller.signal);

    expect(requests).toEqual([
      {
        path: '/api/v1/practice-proposals',
        method: 'POST',
        body: requestBody,
        signal: controller.signal,
      },
    ]);
    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.result.practiceProposals.map(({ proposalNumber }) => proposalNumber)).toEqual([
        1, 2, 3,
      ]);
    }
  });

  it.each([
    { ...successBody(), unexpected: true },
    { ...successBody(), conditions: { ...requestBody, difficulty: '9' } },
    { ...successBody(), practiceProposals: successBody().practiceProposals.slice(0, 2) },
    {
      ...successBody(),
      practiceProposals: successBody().practiceProposals.map((proposal) => ({
        ...proposal,
        proposalNumber: 1,
      })),
    },
    {
      ...successBody(),
      practiceProposals: successBody().practiceProposals.map((proposal, index) =>
        index === 0 ? { ...proposal, title: ` ${proposal.title}` } : proposal,
      ),
    },
  ])('rejects an invalid success payload', async (body) => {
    await expect(
      clientFor({ status: 200, isJson: true, body }).create(
        requestBody,
        new AbortController().signal,
      ),
    ).resolves.toEqual({ kind: 'generic-error' });
  });

  it('maps only known validation fields', async () => {
    const valid = await clientFor({
      status: 400,
      isJson: true,
      body: {
        errorCode: 'VE0001',
        errorMessage: 'invalid',
        validationMessage: { technologyName: 'invalid', durationHours: 'invalid' },
      },
    }).create(requestBody, new AbortController().signal);
    const invalid = await clientFor({
      status: 400,
      isJson: true,
      body: {
        errorCode: 'VE0001',
        errorMessage: 'invalid',
        validationMessage: { unknownField: 'invalid' },
      },
    }).create(requestBody, new AbortController().signal);

    expect(valid).toEqual({
      kind: 'validation-error',
      fields: ['technologyName', 'durationHours'],
    });
    expect(invalid).toEqual({ kind: 'generic-error' });
  });

  it.each([null, '', 1])(
    'rejects a validation error with an invalid error message: %j',
    async (errorMessage) => {
      await expect(
        clientFor({
          status: 400,
          isJson: true,
          body: {
            errorCode: 'VE0001',
            errorMessage,
            validationMessage: { technologyName: 'invalid' },
          },
        }).create(requestBody, new AbortController().signal),
      ).resolves.toEqual({ kind: 'generic-error' });
    },
  );

  it.each([
    [
      { status: 500, isJson: true, body: { errorCode: 'GAI001', errorMessage: 'failed' } },
      'generation-error',
    ],
    [
      { status: 400, isJson: true, body: { errorCode: 'REQ001', errorMessage: 'failed' } },
      'generic-error',
    ],
    [
      { status: 500, isJson: true, body: { errorCode: 'UNKNOWN', errorMessage: 'failed' } },
      'generic-error',
    ],
    [{ status: 500, isJson: false, body: null }, 'generic-error'],
  ] as const)('maps an error response without exposing its body', async (response, kind) => {
    await expect(
      clientFor(response).create(requestBody, new AbortController().signal),
    ).resolves.toEqual({ kind });
  });
});
