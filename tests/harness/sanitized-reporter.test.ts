import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { TestCase, TestResult } from '@playwright/test/reporter';
import { afterEach, describe, expect, it, vi } from 'vitest';

import SanitizedReporter from '../e2e/reporters/sanitized-reporter.ts';

const temporaryDirectories: string[] = [];

function testCase(title: string, annotations: TestCase['annotations']): TestCase {
  return { title, annotations } as TestCase;
}

function testResult(
  status: TestResult['status'],
  duration: number,
  location?: { file: string; line: number; column: number },
  failureStep?: string,
): TestResult {
  return {
    status,
    duration,
    error: { message: 'SECRET_ERROR_BODY', stack: 'SECRET_STACK' },
    errors: [{ message: 'SECRET_SECOND_ERROR', location }],
    stdout: ['SECRET_STDOUT'],
    stderr: ['SECRET_STDERR'],
    attachments: [{ name: 'SECRET_ATTACHMENT', contentType: 'text/plain' }],
    steps:
      failureStep === undefined
        ? []
        : [
            {
              title: failureStep,
              error: { message: 'SECRET_STEP_ERROR' },
              steps: [],
            },
          ],
  } as unknown as TestResult;
}

async function outputPaths(): Promise<{ directory: string; jsonPath: string; junitPath: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'sanitized-reporter-'));
  temporaryDirectories.push(directory);
  return {
    directory,
    jsonPath: join(directory, 'nested', 'results.json'),
    junitPath: join(directory, 'nested', 'junit.xml'),
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('SanitizedReporter', () => {
  it('accepts every formal browser test ID while rejecting runtime-only T-020', async () => {
    const { jsonPath, junitPath } = await outputPaths();
    const reporter = new SanitizedReporter({ jsonPath, junitPath, environment: {} });

    reporter.onTestEnd(
      testCase('[T-002][initial-ui] safe title', [
        { type: 'test-id', description: 'T-002' },
        { type: 'case-id', description: 'initial-ui' },
        { type: 'classification', description: 'deployed' },
      ]),
      testResult('passed', 1),
    );
    reporter.onTestEnd(
      testCase('[T-020][runtime-only] safe title', [
        { type: 'test-id', description: 'T-020' },
        { type: 'case-id', description: 'runtime-only' },
        { type: 'classification', description: 'deployed' },
      ]),
      testResult('passed', 1),
    );
    const reporterResult = await reporter.onEnd();

    const parsed = JSON.parse(await readFile(jsonPath, 'utf8')) as {
      summary: Record<string, number>;
      tests: SanitizedRecord[];
    };
    expect(parsed.summary).toEqual({ total: 2, passed: 1, failed: 1, skipped: 0 });
    expect(reporterResult).toEqual({ status: 'failed' });
    expect(parsed.tests.map(({ testId, status }) => ({ testId, status }))).toEqual([
      { testId: 'T-000', status: 'failed' },
      { testId: 'T-002', status: 'passed' },
    ]);
  });

  it('writes only allowlisted fields and never emits raw Playwright failure data', async () => {
    const { jsonPath, junitPath } = await outputPaths();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const reporter = new SanitizedReporter({
      jsonPath,
      junitPath,
      environment: {
        CI_COMMIT_SHA: 'a'.repeat(40),
        IMAGE_DIGEST: `sha256:${'b'.repeat(64)}`,
        CI_JOB_URL: 'https://gitlab.example.test/jobs/123?token=SECRET_QUERY#SECRET_FRAGMENT',
      },
    });

    reporter.onTestEnd(
      testCase('[T-005][proposal-submit] SECRET_RAW_TITLE', [
        { type: 'test-id', description: 'T-005' },
        { type: 'case-id', description: 'proposal-submit' },
        { type: 'classification', description: 'controlled' },
      ]),
      testResult('failed', 12.6),
    );
    await reporter.onEnd();

    const jsonText = await readFile(jsonPath, 'utf8');
    const junitText = await readFile(junitPath, 'utf8');
    const parsed = JSON.parse(jsonText) as {
      summary: Record<string, number>;
      tests: Record<string, unknown>[];
    };

    expect(Object.keys(parsed)).toEqual(['summary', 'tests']);
    expect(Object.keys(parsed.summary)).toEqual(['total', 'passed', 'failed', 'skipped']);
    expect(Object.keys(parsed.tests[0] ?? {})).toEqual([
      'testId',
      'caseId',
      'classification',
      'status',
      'failureCategory',
      'failureLocation',
      'failureStep',
      'durationMs',
      'commitSha',
      'imageDigest',
      'jobUrl',
    ]);
    expect(parsed.tests[0]).toEqual({
      testId: 'T-005',
      caseId: 'proposal-submit',
      classification: 'controlled',
      status: 'failed',
      failureCategory: 'runtime',
      failureLocation: 'UNAVAILABLE',
      failureStep: 'UNAVAILABLE',
      durationMs: 13,
      commitSha: 'a'.repeat(40),
      imageDigest: `sha256:${'b'.repeat(64)}`,
      jobUrl: 'https://gitlab.example.test/jobs/123',
    });

    const combinedOutput = `${jsonText}\n${junitText}`;
    for (const forbidden of [
      'SECRET_RAW_TITLE',
      'SECRET_ERROR_BODY',
      'SECRET_STACK',
      'SECRET_SECOND_ERROR',
      'SECRET_STDOUT',
      'SECRET_STDERR',
      'SECRET_ATTACHMENT',
      'SECRET_QUERY',
      'SECRET_FRAGMENT',
    ]) {
      expect(combinedOutput).not.toContain(forbidden);
    }
    expect(junitText).toContain('<testsuite name="dev-menu-web-integration"');
    expect(junitText).toContain(
      'name="T-005.proposal-submit" classname="controlled" testId="T-005" caseId="proposal-submit" status="failed"',
    );
    expect(junitText).toContain('<failure />');
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();
  });

  it('turns malformed or inconsistent metadata into a sanitized failure', async () => {
    const { jsonPath, junitPath } = await outputPaths();
    const reporter = new SanitizedReporter({
      jsonPath,
      junitPath,
      environment: {
        CI_COMMIT_SHA: 'SECRET_INVALID_SHA',
        IMAGE_DIGEST: 'SECRET_INVALID_DIGEST',
        CI_JOB_URL: 'javascript:SECRET_INVALID_URL',
      },
    });

    reporter.onTestEnd(
      testCase('[T-005][safe-case] SECRET_BAD_METADATA', [
        { type: 'test-id', description: 'T-005' },
        { type: 'case-id', description: 'different-case' },
        { type: 'classification', description: 'controlled' },
      ]),
      testResult('passed', Number.NaN),
    );
    await reporter.onEnd();

    const jsonText = await readFile(jsonPath, 'utf8');
    const junitText = await readFile(junitPath, 'utf8');
    const parsed = JSON.parse(jsonText) as {
      summary: Record<string, number>;
      tests: SanitizedRecord[];
    };

    expect(parsed.summary).toEqual({ total: 1, passed: 0, failed: 1, skipped: 0 });
    expect(parsed.tests[0]).toEqual({
      testId: 'T-000',
      caseId: 'invalid-metadata',
      classification: 'invalid',
      status: 'failed',
      failureCategory: 'runtime',
      failureLocation: 'UNAVAILABLE',
      failureStep: 'UNAVAILABLE',
      durationMs: 0,
      commitSha: 'UNAVAILABLE',
      imageDigest: 'UNAVAILABLE',
      jobUrl: 'UNAVAILABLE',
    });
    expect(`${jsonText}\n${junitText}`).not.toMatch(/SECRET_|different-case|safe-case/);
  });

  it('records only allowlisted failure categories and test source locations', async () => {
    const { jsonPath, junitPath } = await outputPaths();
    const reporter = new SanitizedReporter({ jsonPath, junitPath, environment: {} });
    const annotations: TestCase['annotations'] = [
      { type: 'test-id', description: 'T-005' },
      { type: 'case-id', description: 'proposal-submit' },
      { type: 'classification', description: 'controlled' },
    ];

    reporter.onTestEnd(
      testCase('[T-005][proposal-submit] safe title', annotations),
      testResult('failed', 5, {
        file: '/builds/project/tests/e2e/controlled/practice-proposal.spec.ts',
        line: 42,
        column: 9,
      }),
    );
    reporter.onTestEnd(
      testCase('[T-005][proposal-submit] safe title', annotations),
      testResult('timedOut', 30_000, {
        file: '/builds/project/tests/e2e/controlled/practice-proposal.spec.ts',
        line: 84,
        column: 3,
      }),
    );
    reporter.onTestEnd(
      testCase('[T-005][proposal-submit] safe title', annotations),
      testResult('failed', 1, {
        file: '/builds/project/src/SECRET_INTERNAL.ts',
        line: 7,
        column: 1,
      }),
    );
    await reporter.onEnd();

    const jsonText = await readFile(jsonPath, 'utf8');
    const parsed = JSON.parse(jsonText) as { tests: SanitizedRecord[] };
    expect(
      parsed.tests.map(({ failureCategory, failureLocation }) => ({
        failureCategory,
        failureLocation,
      })),
    ).toEqual([
      {
        failureCategory: 'assertion',
        failureLocation: 'tests/e2e/controlled/practice-proposal.spec.ts:42',
      },
      {
        failureCategory: 'timeout',
        failureLocation: 'tests/e2e/controlled/practice-proposal.spec.ts:84',
      },
      { failureCategory: 'runtime', failureLocation: 'UNAVAILABLE' },
    ]);
    expect(jsonText).not.toContain('SECRET_INTERNAL');
  });

  it('records only explicitly allowlisted diagnostic step identifiers', async () => {
    const { jsonPath, junitPath } = await outputPaths();
    const reporter = new SanitizedReporter({ jsonPath, junitPath, environment: {} });
    const annotations: TestCase['annotations'] = [
      { type: 'test-id', description: 'T-005' },
      { type: 'case-id', description: 'proposal-submit' },
      { type: 'classification', description: 'controlled' },
    ];

    reporter.onTestEnd(
      testCase('[T-005][proposal-submit] safe title', annotations),
      testResult('timedOut', 30_000, undefined, 'diag.reorder.in-flight'),
    );
    reporter.onTestEnd(
      testCase('[T-005][proposal-submit] safe title', annotations),
      testResult('failed', 1, undefined, 'SECRET_STEP_IDENTIFIER'),
    );
    await reporter.onEnd();

    const jsonText = await readFile(jsonPath, 'utf8');
    const parsed = JSON.parse(jsonText) as { tests: SanitizedRecord[] };
    expect(parsed.tests.map(({ failureStep }) => failureStep)).toEqual([
      'diag.reorder.in-flight',
      'UNAVAILABLE',
    ]);
    expect(jsonText).not.toContain('SECRET_STEP');
  });
});

interface SanitizedRecord {
  testId: string;
  caseId: string;
  classification: string;
  status: string;
  failureCategory: string;
  failureLocation: string;
  failureStep: string;
  durationMs: number;
  commitSha: string;
  imageDigest: string;
  jobUrl: string;
}
