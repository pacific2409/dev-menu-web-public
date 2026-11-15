import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createJsonResponse,
  createNetworkFailure,
  createTextResponse,
} from '../e2e/fixtures/contract-response-builders.ts';
import { requireRealSystemGates } from '../e2e/fixtures/environment-gates.ts';
import { loadRealSystemInputs } from '../e2e/fixtures/real-system-inputs.ts';
import { validateTestMetadata } from '../e2e/helpers/test-metadata.ts';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('formal integration test harness foundations', () => {
  it('accepts only traceable test metadata', () => {
    expect(
      validateTestMetadata({
        testId: 'T-005',
        caseId: 'known-error',
        classification: 'controlled',
      }),
    ).toEqual({ testId: 'T-005', caseId: 'known-error', classification: 'controlled' });

    expect(() =>
      validateTestMetadata({
        testId: 'T-020',
        caseId: 'not-in-harness',
        classification: 'deployed',
      }),
    ).toThrow('invalid test ID');
    expect(() =>
      validateTestMetadata({
        testId: 'T-005',
        caseId: 'unsafe value',
        classification: 'controlled',
      }),
    ).toThrow('invalid case ID');
  });

  it('builds classified controlled responses without changing their bodies', () => {
    const body = { errorCode: 'DB9999', errorMessage: 'fixed contract fixture' };

    expect(createJsonResponse('known-error', 500, body)).toEqual({
      kind: 'json',
      classification: 'known-error',
      status: 500,
      body,
    });
    expect(createNetworkFailure('timedout')).toEqual({
      kind: 'network-failure',
      classification: 'network-failure',
      failureCode: 'timedout',
    });
    expect(createTextResponse(500, 'opaque')).toEqual({
      kind: 'text',
      classification: 'contract-mismatch',
      status: 500,
      body: 'opaque',
    });
    expect(() => createJsonResponse('success', 99, {})).toThrow('invalid HTTP status');
  });

  it('returns only boolean readiness after all real-system gates are explicit', () => {
    expect(
      requireRealSystemGates({
        INTEGRATION_TEST_MODE: 'real',
        IMAGE_DIGEST: `sha256:${'a'.repeat(64)}`,
        DEPENDENCIES_READY: 'true',
        FIXTURE_CONTRACT_READY: 'true',
        FIXTURE_SETUP_READY: 'true',
        CLEANUP_CONTRACT_READY: 'true',
      }),
    ).toEqual({
      mode: 'real',
      dependenciesReady: true,
      fixtureContractReady: true,
      fixtureSetupReady: true,
      cleanupContractReady: true,
      imageDigestVerified: true,
    });

    expect(() =>
      requireRealSystemGates({
        INTEGRATION_TEST_MODE: 'real',
        IMAGE_DIGEST: `sha256:${'a'.repeat(64)}`,
        DEPENDENCIES_READY: 'true',
        FIXTURE_CONTRACT_READY: 'true',
        FIXTURE_SETUP_READY: 'true',
      }),
    ).toThrow('Cleanup contract gate is not ready');
  });

  it('keeps proposal-write and read-only fixture technologies separate', () => {
    const environment = {
      INTEGRATION_TEST_MODE: 'real',
      IMAGE_DIGEST: `sha256:${'a'.repeat(64)}`,
      DEPENDENCIES_READY: 'true',
      FIXTURE_CONTRACT_READY: 'true',
      FIXTURE_SETUP_READY: 'true',
      CLEANUP_CONTRACT_READY: 'true',
      E2E_REAL_TECHNOLOGY_INPUT: ' Write Technology ',
      E2E_REAL_TECHNOLOGY_NAME: 'Write Technology',
      E2E_REAL_FIXTURE_TECHNOLOGY_NAME: 'Read Fixture Technology',
      E2E_REAL_TECHNOLOGY_ID: '10',
      E2E_REAL_HISTORY_ID: '20',
      E2E_REAL_ORDERED_HISTORY_IDS: '21,20',
    };
    for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value);

    expect(loadRealSystemInputs()).toEqual({
      technologyInput: ' Write Technology ',
      normalizedTechnologyName: 'Write Technology',
      fixtureTechnologyName: 'Read Fixture Technology',
      technologyId: '10',
      historyId: '20',
      orderedHistoryIds: ['21', '20'],
    });
  });
});
