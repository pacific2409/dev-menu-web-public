import type { TestDetails, TestInfo } from '@playwright/test';

export const TEST_ID_PATTERN = /^T-(?:00[1-9]|01[0-9])$/;
export const CASE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type TestClassification = 'controlled' | 'deployed' | 'real';

export interface TestMetadata {
  testId: string;
  caseId: string;
  classification: TestClassification;
}

export function validateTestMetadata(metadata: TestMetadata) {
  if (!TEST_ID_PATTERN.test(metadata.testId)) {
    throw new Error('Test metadata contains an invalid test ID.');
  }
  if (!CASE_ID_PATTERN.test(metadata.caseId)) {
    throw new Error('Test metadata contains an invalid case ID.');
  }

  return metadata;
}

export function annotateTest(testInfo: TestInfo, metadata: TestMetadata) {
  const validated = validateTestMetadata(metadata);
  testInfo.annotations.push(
    { type: 'test-id', description: validated.testId },
    { type: 'case-id', description: validated.caseId },
    { type: 'classification', description: validated.classification },
  );
}

export function createTestDetails(metadata: TestMetadata): TestDetails {
  const validated = validateTestMetadata(metadata);
  return {
    annotation: [
      { type: 'test-id', description: validated.testId },
      { type: 'case-id', description: validated.caseId },
      { type: 'classification', description: validated.classification },
    ],
  };
}
