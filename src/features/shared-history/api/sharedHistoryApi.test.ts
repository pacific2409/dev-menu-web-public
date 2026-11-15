import { describe, expect, it } from 'vitest';

import type {
  JsonHttpClient,
  JsonHttpRequest,
  JsonHttpResponse,
} from '../../../shared/api/jsonHttpClient.ts';
import { createSharedHistoryApiClient } from './sharedHistoryApi.ts';

function clientFor(responses: JsonHttpResponse[], requests: JsonHttpRequest[] = []) {
  let index = 0;
  const httpClient: JsonHttpClient = {
    request(request) {
      requests.push(request);
      const response = responses[index];
      index += 1;
      if (response === undefined) {
        throw new Error('Unexpected request');
      }
      return Promise.resolve(response);
    },
  };
  return createSharedHistoryApiClient(httpClient);
}

function validHistoryBody() {
  return {
    technologyId: '9223372036854775807',
    technologyName: 'React',
    sharedHistories: [
      {
        historyId: '20',
        createdAt: '2026-01-02T03:04:05.123456Z',
        difficulty: '2',
        durationHours: 4,
        purpose: '1',
      },
      {
        historyId: '19',
        createdAt: '2026-01-01T03:04:05Z',
        difficulty: '1',
        durationHours: 2,
        purpose: '2',
      },
    ],
  };
}

function validDetailBody() {
  return {
    historyId: '20',
    createdAt: '2026-01-02T03:04:05.123456Z',
    conditions: {
      technologyId: '2',
      technologyName: 'React',
      difficulty: '2',
      durationHours: 4,
      purpose: '1',
      additionalPreference: '型安全を重視',
    },
    practiceProposals: [
      {
        proposalNumber: 3,
        title: '課題3',
        overview: '概要3',
        achievementGoal: '目標3',
        practiceFocus: 'ポイント3',
      },
      {
        proposalNumber: 1,
        title: '課題1',
        overview: '概要1',
        achievementGoal: '目標1',
        practiceFocus: 'ポイント1',
      },
      {
        proposalNumber: 2,
        title: '課題2',
        overview: '概要2',
        achievementGoal: '目標2',
        practiceFocus: 'ポイント2',
      },
    ],
  };
}

describe('sharedHistoryApi', () => {
  it('loads technologies in backend order with a bodyless GET', async () => {
    const requests: JsonHttpRequest[] = [];
    const controller = new AbortController();
    const result = await clientFor(
      [
        {
          status: 200,
          isJson: true,
          body: {
            technologies: [
              { technologyId: '2', technologyName: 'Vue' },
              { technologyId: '1', technologyName: 'React' },
            ],
          },
        },
      ],
      requests,
    ).listTechnologies(controller.signal);

    expect(requests).toEqual([
      { path: '/api/v1/technologies', method: 'GET', signal: controller.signal },
    ]);
    expect(result).toEqual({
      kind: 'success',
      technologies: [
        { technologyId: '2', technologyName: 'Vue' },
        { technologyId: '1', technologyName: 'React' },
      ],
    });
  });

  it.each([
    { technologies: [{ technologyId: '01', technologyName: 'React' }] },
    { technologies: [{ technologyId: '1', technologyName: '' }] },
    { technologies: [{ technologyId: '1', technologyName: 'React', extra: true }] },
    { technologies: null },
    { technologies: [], extra: true },
  ])('rejects an invalid technology-list payload as a whole', async (body) => {
    await expect(
      clientFor([{ status: 200, isJson: true, body }]).listTechnologies(
        new AbortController().signal,
      ),
    ).resolves.toEqual({ kind: 'generic-error' });
  });

  it('maps a valid history list in backend order', async () => {
    const requests: JsonHttpRequest[] = [];
    const result = await clientFor(
      [{ status: 200, isJson: true, body: validHistoryBody() }],
      requests,
    ).listHistories('9223372036854775807', new AbortController().signal);

    expect(requests[0]?.path).toBe('/api/v1/technologies/9223372036854775807/shared-histories');
    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.result.sharedHistories.map(({ historyId }) => historyId)).toEqual(['20', '19']);
      expect(result.result.sharedHistories[0]).toMatchObject({
        difficultyLabel: '中級',
        durationHours: 4,
        purposeLabel: '技術習得',
      });
    }
  });

  it.each([
    { ...validHistoryBody(), technologyId: '1' },
    { ...validHistoryBody(), extra: true },
    {
      ...validHistoryBody(),
      sharedHistories: validHistoryBody().sharedHistories.map((history, index) =>
        index === 0 ? { ...history, createdAt: '2026-02-29T00:00:00Z' } : history,
      ),
    },
    {
      ...validHistoryBody(),
      sharedHistories: validHistoryBody().sharedHistories.map((history, index) =>
        index === 0 ? { ...history, difficulty: '9' } : history,
      ),
    },
  ])('rejects an invalid history payload without partial mapping', async (body) => {
    await expect(
      clientFor([{ status: 200, isJson: true, body }]).listHistories(
        '9223372036854775807',
        new AbortController().signal,
      ),
    ).resolves.toEqual({ kind: 'generic-error' });
  });

  it.each([
    [400, 'REQ003', 'invalid-selection'],
    [404, 'TEC001', 'invalid-selection'],
    [500, 'DB9999', 'generic-error'],
    [400, 'TEC001', 'generic-error'],
    [500, 'UNKNOWN', 'generic-error'],
  ] as const)('maps only matching status and error code pairs', async (status, errorCode, kind) => {
    await expect(
      clientFor([
        { status, isJson: true, body: { errorCode, errorMessage: 'not exposed' } },
      ]).listHistories('1', new AbortController().signal),
    ).resolves.toEqual({ kind });
  });

  it('maps an opaque history error to the generic error', async () => {
    await expect(
      clientFor([{ status: 500, isJson: false, body: null }]).listHistories(
        '1',
        new AbortController().signal,
      ),
    ).resolves.toEqual({ kind: 'generic-error' });
  });

  it('loads and maps a complete detail with a bodyless GET and proposal ordering', async () => {
    const requests: JsonHttpRequest[] = [];
    const controller = new AbortController();
    const result = await clientFor(
      [{ status: 200, isJson: true, body: validDetailBody() }],
      requests,
    ).getHistoryDetail('20', controller.signal);

    expect(requests).toEqual([
      { path: '/api/v1/shared-histories/20', method: 'GET', signal: controller.signal },
    ]);
    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.result).toMatchObject({
        historyId: '20',
        createdAt: '2026-01-02T03:04:05.123456Z',
        conditions: {
          technologyId: '2',
          difficultyLabel: '中級',
          purposeLabel: '技術習得',
        },
      });
      expect(result.result.createdAtLabel.length).toBeGreaterThan(0);
      expect(result.result.practiceProposals.map(({ proposalNumber }) => proposalNumber)).toEqual([
        1, 2, 3,
      ]);
    }
  });

  it('preserves meaningful whitespace and line breaks in required proposal fields', async () => {
    const body = validDetailBody();
    body.practiceProposals = body.practiceProposals.map((proposal, index) =>
      index === 0 ? { ...proposal, title: ' 課題3\n詳細 ' } : proposal,
    );

    const result = await clientFor([{ status: 200, isJson: true, body }]).getHistoryDetail(
      '20',
      new AbortController().signal,
    );

    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.result.practiceProposals[2]?.title).toBe(' 課題3\n詳細 ');
    }
  });

  it.each([
    { ...validDetailBody(), historyId: '21' },
    { ...validDetailBody(), extra: true },
    { ...validDetailBody(), createdAt: '2026-02-29T00:00:00Z' },
    {
      ...validDetailBody(),
      conditions: { ...validDetailBody().conditions, technologyId: '01' },
    },
    {
      ...validDetailBody(),
      conditions: { ...validDetailBody().conditions, additionalPreference: '' },
    },
    {
      ...validDetailBody(),
      practiceProposals: validDetailBody().practiceProposals.map((proposal) => ({
        ...proposal,
        proposalNumber: 1,
      })),
    },
    {
      ...validDetailBody(),
      practiceProposals: validDetailBody().practiceProposals.slice(0, 2),
    },
    {
      ...validDetailBody(),
      practiceProposals: validDetailBody().practiceProposals.map((proposal, index) =>
        index === 0 ? { ...proposal, title: '' } : proposal,
      ),
    },
    {
      ...validDetailBody(),
      practiceProposals: validDetailBody().practiceProposals.map((proposal, index) =>
        index === 0 ? { ...proposal, title: ' \n\t' } : proposal,
      ),
    },
    {
      ...validDetailBody(),
      practiceProposals: validDetailBody().practiceProposals.map((proposal, index) =>
        index === 0 ? { ...proposal, overview: '\u3000' } : proposal,
      ),
    },
    {
      ...validDetailBody(),
      practiceProposals: validDetailBody().practiceProposals.map((proposal, index) =>
        index === 0 ? { ...proposal, achievementGoal: '\r\n' } : proposal,
      ),
    },
    {
      ...validDetailBody(),
      practiceProposals: validDetailBody().practiceProposals.map((proposal, index) =>
        index === 0 ? { ...proposal, practiceFocus: '\t' } : proposal,
      ),
    },
  ])('rejects an invalid detail payload as a whole', async (body) => {
    await expect(
      clientFor([{ status: 200, isJson: true, body }]).getHistoryDetail(
        '20',
        new AbortController().signal,
      ),
    ).resolves.toEqual({ kind: 'generic-error' });
  });

  it.each([
    [400, 'REQ003', 'invalid-history-id'],
    [404, 'SH0001', 'not-found'],
    [500, 'SH0002', 'generic-error'],
    [500, 'DB9999', 'generic-error'],
    [500, 'ER9999', 'generic-error'],
    [404, 'REQ003', 'generic-error'],
    [500, 'UNKNOWN', 'generic-error'],
  ] as const)(
    'maps only matching detail status and code pairs',
    async (status, errorCode, kind) => {
      await expect(
        clientFor([
          { status, isJson: true, body: { errorCode, errorMessage: 'not exposed' } },
        ]).getHistoryDetail('20', new AbortController().signal),
      ).resolves.toEqual({ kind });
    },
  );

  it('maps an opaque detail error to the generic error', async () => {
    await expect(
      clientFor([{ status: 500, isJson: false, body: null }]).getHistoryDetail(
        '20',
        new AbortController().signal,
      ),
    ).resolves.toEqual({ kind: 'generic-error' });
  });
});
