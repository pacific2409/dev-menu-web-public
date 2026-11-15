import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { Reporter, TestCase, TestResult, TestStep } from '@playwright/test/reporter';

const DEFAULT_JSON_PATH = 'reports/playwright/results.json';
const DEFAULT_JUNIT_PATH = 'reports/playwright/junit.xml';
const UNAVAILABLE = 'UNAVAILABLE';
const INVALID_TEST_ID = 'T-000';
const INVALID_CASE_ID = 'invalid-metadata';
const INVALID_CLASSIFICATION = 'invalid';

const TEST_ID_PATTERN = /^T-(?:00[1-9]|01[0-9])$/;
const CASE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CLASSIFICATIONS = new Set(['controlled', 'deployed', 'real']);
const TITLE_PATTERN = /^\[(T-(?:00[1-9]|01[0-9]))\]\[([a-z0-9]+(?:-[a-z0-9]+)*)\](?:\s|$)/;
const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/i;
const IMAGE_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/i;
const SANITIZED_FAILURE_STEPS = new Set([
  'diag.initial-form.presence',
  'diag.initial-form.editable',
  'diag.initial-form.empty',
  'diag.reorder.initial-submit',
  'diag.reorder.in-flight',
  'diag.reorder.success',
  'diag.reorder.failure',
  'diag.reorder.reload-clear',
  'diag.error-mapping.known-error',
  'diag.error-mapping.unknown-error',
  'diag.error-mapping.contract-mismatch',
  'diag.error-mapping.network-failure',
  'diag.error-mapping.validation-error',
  'diag.stateless.initial-edit',
  'diag.stateless.reload-clear',
  'diag.stateless.fresh-context',
]);

type SanitizedStatus = 'passed' | 'failed' | 'skipped';
type FailureCategory = 'none' | 'assertion' | 'timeout' | 'runtime';

export interface SanitizedResult {
  testId: string;
  caseId: string;
  classification: string;
  status: SanitizedStatus;
  failureCategory: FailureCategory;
  failureLocation: string;
  failureStep: string;
  durationMs: number;
  commitSha: string;
  imageDigest: string;
  jobUrl: string;
}

interface ReporterEnvironment {
  CI_COMMIT_SHA?: string;
  IMAGE_DIGEST?: string;
  CI_JOB_URL?: string;
}

interface ReporterOptions {
  jsonPath?: string;
  junitPath?: string;
  environment?: ReporterEnvironment;
}

interface Metadata {
  testId: string;
  caseId: string;
  classification: string;
}

const TEST_FAILURE_LOCATION_PATTERN =
  /^tests\/e2e\/(?:controlled|deployed|real)\/[a-z0-9-]+\.spec\.ts$/;

function annotationValue(test: TestCase, type: string): string | undefined {
  const matches = test.annotations.filter((annotation) => annotation.type === type);
  if (matches.length !== 1) return undefined;
  return matches[0]?.description;
}

function sanitizedMetadata(test: TestCase): Metadata | undefined {
  const titleMatch = TITLE_PATTERN.exec(test.title);
  const testId = annotationValue(test, 'test-id');
  const caseId = annotationValue(test, 'case-id');
  const classification = annotationValue(test, 'classification');

  if (
    titleMatch === null ||
    testId === undefined ||
    caseId === undefined ||
    classification === undefined ||
    !TEST_ID_PATTERN.test(testId) ||
    !CASE_ID_PATTERN.test(caseId) ||
    !CLASSIFICATIONS.has(classification) ||
    titleMatch[1] !== testId ||
    titleMatch[2] !== caseId
  ) {
    return undefined;
  }

  return { testId, caseId, classification };
}

function sanitizedJobUrl(value: string | undefined): string {
  if (value === undefined) return UNAVAILABLE;

  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') return UNAVAILABLE;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return UNAVAILABLE;
  }
}

function normalizedStatus(status: TestResult['status']): SanitizedStatus {
  if (status === 'passed') return 'passed';
  if (status === 'skipped') return 'skipped';
  return 'failed';
}

function sanitizedFailureDetails(
  result: TestResult,
  status: SanitizedStatus,
): { category: FailureCategory; location: string } {
  if (status !== 'failed') return { category: 'none', location: UNAVAILABLE };

  const errorLocation = result.errors.find(({ location }) => location !== undefined)?.location;
  const normalizedFile = errorLocation?.file.replaceAll('\\', '/');
  const repositoryRelativeFile = normalizedFile?.replace(/^.*\/(tests\/e2e\/)/, '$1');
  const location =
    repositoryRelativeFile !== undefined &&
    TEST_FAILURE_LOCATION_PATTERN.test(repositoryRelativeFile) &&
    Number.isInteger(errorLocation?.line) &&
    (errorLocation?.line ?? 0) > 0
      ? `${repositoryRelativeFile}:${String(errorLocation?.line)}`
      : UNAVAILABLE;

  if (result.status === 'timedOut') return { category: 'timeout', location };
  if (location !== UNAVAILABLE) return { category: 'assertion', location };
  return { category: 'runtime', location };
}

function sanitizedFailureStep(steps: readonly TestStep[]): string {
  for (const step of steps) {
    if (step.error !== undefined && SANITIZED_FAILURE_STEPS.has(step.title)) return step.title;
    const nestedFailureStep = sanitizedFailureStep(step.steps);
    if (nestedFailureStep !== UNAVAILABLE) return nestedFailureStep;
  }
  return UNAVAILABLE;
}

function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function createJUnitReport(results: readonly SanitizedResult[]): string {
  const failures = results.filter((result) => result.status === 'failed').length;
  const skipped = results.filter((result) => result.status === 'skipped').length;
  const cases = results
    .map((result) => {
      const attributes = `name="${xmlEscape(`${result.testId}.${result.caseId}`)}" classname="${xmlEscape(result.classification)}" testId="${xmlEscape(result.testId)}" caseId="${xmlEscape(result.caseId)}" status="${result.status}" failureCategory="${result.failureCategory}" failureLocation="${xmlEscape(result.failureLocation)}" failureStep="${xmlEscape(result.failureStep)}"`;
      if (result.status === 'failed') return `    <testcase ${attributes}><failure /></testcase>`;
      if (result.status === 'skipped') return `    <testcase ${attributes}><skipped /></testcase>`;
      return `    <testcase ${attributes} />`;
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="dev-menu-web-integration" tests="${String(results.length)}" failures="${String(failures)}" skipped="${String(skipped)}">`,
    cases,
    '</testsuite>',
    '',
  ].join('\n');
}

export default class SanitizedReporter implements Reporter {
  private readonly results: SanitizedResult[] = [];
  private readonly jsonPath: string;
  private readonly junitPath: string;
  private readonly environment: ReporterEnvironment;

  constructor(options: ReporterOptions = {}) {
    this.jsonPath = options.jsonPath ?? DEFAULT_JSON_PATH;
    this.junitPath = options.junitPath ?? DEFAULT_JUNIT_PATH;
    this.environment = options.environment ?? process.env;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const metadata = sanitizedMetadata(test);
    const status = metadata === undefined ? 'failed' : normalizedStatus(result.status);
    const failure = sanitizedFailureDetails(result, status);

    this.results.push({
      testId: metadata?.testId ?? INVALID_TEST_ID,
      caseId: metadata?.caseId ?? INVALID_CASE_ID,
      classification: metadata?.classification ?? INVALID_CLASSIFICATION,
      status,
      failureCategory: failure.category,
      failureLocation: failure.location,
      failureStep: sanitizedFailureStep(result.steps),
      durationMs: Number.isFinite(result.duration) ? Math.max(0, Math.round(result.duration)) : 0,
      commitSha: COMMIT_SHA_PATTERN.test(this.environment.CI_COMMIT_SHA ?? '')
        ? (this.environment.CI_COMMIT_SHA ?? UNAVAILABLE)
        : UNAVAILABLE,
      imageDigest: IMAGE_DIGEST_PATTERN.test(this.environment.IMAGE_DIGEST ?? '')
        ? (this.environment.IMAGE_DIGEST ?? UNAVAILABLE)
        : UNAVAILABLE,
      jobUrl: sanitizedJobUrl(this.environment.CI_JOB_URL),
    });
  }

  async onEnd(): Promise<{ status: 'failed' } | undefined> {
    const orderedResults = [...this.results].sort(
      (left, right) =>
        left.testId.localeCompare(right.testId) || left.caseId.localeCompare(right.caseId),
    );
    const summary = {
      total: orderedResults.length,
      passed: orderedResults.filter((result) => result.status === 'passed').length,
      failed: orderedResults.filter((result) => result.status === 'failed').length,
      skipped: orderedResults.filter((result) => result.status === 'skipped').length,
    };

    await Promise.all([
      mkdir(dirname(this.jsonPath), { recursive: true }),
      mkdir(dirname(this.junitPath), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(
        this.jsonPath,
        `${JSON.stringify({ summary, tests: orderedResults }, null, 2)}\n`,
        'utf8',
      ),
      writeFile(this.junitPath, createJUnitReport(orderedResults), 'utf8'),
    ]);
    return summary.failed > 0 ? { status: 'failed' } : undefined;
  }
}
