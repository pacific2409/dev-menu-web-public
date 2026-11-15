import { describe, expect, it } from 'vitest';

import type { ProposalFormValues } from './practiceProposal.ts';
import {
  countCodePoints,
  createProposalRequest,
  getProposalFieldError,
  hasProposalFormErrors,
  normalizeAdditionalPreference,
  normalizeTechnologyName,
  validateProposalForm,
} from './proposalValidation.ts';

const validValues: ProposalFormValues = {
  technologyName: 'React',
  difficulty: '2',
  durationHours: '12',
  purpose: '1',
  additionalPreference: '',
};

describe('proposalValidation', () => {
  it('normalizes technology whitespace and trims the optional preference', () => {
    expect(normalizeTechnologyName('  React\n  Testing  ')).toBe('React Testing');
    expect(normalizeAdditionalPreference('  テストを重視  ')).toBe('テストを重視');
  });

  it('counts Unicode code points instead of UTF-16 code units', () => {
    expect(countCodePoints('A😀B')).toBe(3);
  });

  it.each([
    ['technologyName', '', '学びたい技術を入力してください。'],
    ['technologyName', 'a'.repeat(21), '学びたい技術は20文字以内で入力してください。'],
    ['difficulty', '', '難易度を選択してください。'],
    ['difficulty', '4', '難易度を選択してください。'],
    ['durationHours', '', '取り組める時間を入力してください。'],
    ['durationHours', '0', '取り組める時間は1〜999の整数で入力してください。'],
    ['durationHours', '1000', '取り組める時間は1〜999の整数で入力してください。'],
    ['durationHours', '1.5', '取り組める時間は1〜999の整数で入力してください。'],
    ['purpose', '3', '目的を選択してください。'],
    ['additionalPreference', '😀'.repeat(201), 'その他の希望は200文字以内で入力してください。'],
  ] as const)('validates %s boundary values', (field, value, message) => {
    expect(getProposalFieldError(field, value)).toBe(message);
  });

  it('accepts every valid boundary', () => {
    expect(
      validateProposalForm({
        ...validValues,
        technologyName: '😀'.repeat(20),
        durationHours: '999',
        additionalPreference: '😀'.repeat(200),
      }),
    ).toEqual({});
    expect(hasProposalFormErrors({})).toBe(false);
    expect(hasProposalFormErrors({ purpose: 'error' })).toBe(true);
  });

  it('creates a normalized contract request without mutating form values', () => {
    const values = {
      ...validValues,
      technologyName: '  React   Testing ',
      additionalPreference: '   ',
    };
    const snapshot = { ...values };

    expect(createProposalRequest(values)).toEqual({
      technologyName: 'React Testing',
      difficulty: '2',
      durationHours: 12,
      purpose: '1',
      additionalPreference: null,
    });
    expect(values).toEqual(snapshot);
  });

  it('rejects an unvalidated enum value at the contract boundary', () => {
    expect(() => createProposalRequest({ ...validValues, difficulty: '9' })).toThrow(
      'Validated proposal form contains an invalid enum value.',
    );
  });
});
