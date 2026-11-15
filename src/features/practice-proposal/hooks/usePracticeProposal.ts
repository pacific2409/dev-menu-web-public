import { useEffect, useRef, useState } from 'react';

import type {
  PracticeProposalApiClient,
  PracticeProposalApiResult,
} from '../api/practiceProposalApi.ts';
import {
  createProposalRequest,
  FIELD_ERROR_MESSAGES,
  getProposalFieldError,
  hasProposalFormErrors,
  validateProposalForm,
} from '../model/proposalValidation.ts';
import {
  GENERATION_PROPOSAL_ERROR_MESSAGE,
  GENERIC_PROPOSAL_ERROR_MESSAGE,
  INITIAL_PROPOSAL_FORM_VALUES,
  PROPOSAL_FIELD_ORDER,
  type PracticeProposalResultModel,
  type ProposalField,
  type ProposalFormErrors,
  type ProposalFormValues,
} from '../model/practiceProposal.ts';

export type ProposalFocusTarget =
  | { kind: 'field'; field: ProposalField }
  | { kind: 'result' }
  | { kind: 'api-error' }
  | { kind: 'none' };

function getFirstErrorField(errors: ProposalFormErrors) {
  return PROPOSAL_FIELD_ORDER.find((field) => errors[field] !== undefined);
}

function getBackendValidationErrors(fields: ProposalField[], values: ProposalFormValues) {
  const errors: ProposalFormErrors = {};
  for (const field of fields) {
    errors[field] = getProposalFieldError(field, values[field]) ?? FIELD_ERROR_MESSAGES[field];
  }
  return errors;
}

function getApiErrorMessage(result: PracticeProposalApiResult) {
  return result.kind === 'generation-error'
    ? GENERATION_PROPOSAL_ERROR_MESSAGE
    : GENERIC_PROPOSAL_ERROR_MESSAGE;
}

export function usePracticeProposal(apiClient: PracticeProposalApiClient) {
  const [values, setValues] = useState<ProposalFormValues>(INITIAL_PROPOSAL_FORM_VALUES);
  const [errors, setErrors] = useState<ProposalFormErrors>({});
  const [isValidationSummaryVisible, setIsValidationSummaryVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiErrorMessage, setApiErrorMessage] = useState<string>();
  const [result, setResult] = useState<PracticeProposalResultModel>();
  const [isResultPrevious, setIsResultPrevious] = useState(false);
  const [isResultAnnouncementVisible, setIsResultAnnouncementVisible] = useState(false);
  const activeRequestRef = useRef<AbortController | undefined>(undefined);
  const requestSequenceRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      activeRequestRef.current?.abort();
    };
  }, []);

  function updateField(field: ProposalField, value: string) {
    setValues((currentValues) => ({ ...currentValues, [field]: value }));

    if (errors[field] !== undefined) {
      const error = getProposalFieldError(field, value);
      const nextErrors = { ...errors, [field]: error };
      setErrors(nextErrors);
      if (!hasProposalFormErrors(nextErrors)) {
        setIsValidationSummaryVisible(false);
      }
    }
  }

  function validateField(field: ProposalField) {
    const error = getProposalFieldError(field, values[field]);
    setErrors((currentErrors) => ({ ...currentErrors, [field]: error }));
  }

  async function submit(): Promise<ProposalFocusTarget> {
    if (isSubmitting) {
      return { kind: 'none' };
    }

    const snapshot = { ...values };
    const validationErrors = validateProposalForm(snapshot);
    if (hasProposalFormErrors(validationErrors)) {
      setErrors(validationErrors);
      setIsValidationSummaryVisible(true);
      const firstErrorField = getFirstErrorField(validationErrors);
      return firstErrorField === undefined
        ? { kind: 'none' }
        : { kind: 'field', field: firstErrorField };
    }

    const controller = new AbortController();
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    activeRequestRef.current = controller;
    setErrors({});
    setIsValidationSummaryVisible(false);
    setApiErrorMessage(undefined);
    setIsSubmitting(true);
    setIsResultPrevious(result !== undefined);
    setIsResultAnnouncementVisible(false);

    try {
      const apiResult = await apiClient.create(createProposalRequest(snapshot), controller.signal);
      if (
        !isMountedRef.current ||
        controller.signal.aborted ||
        requestSequence !== requestSequenceRef.current
      ) {
        return { kind: 'none' };
      }

      if (apiResult.kind === 'success') {
        setResult(apiResult.result);
        setIsResultPrevious(false);
        setIsResultAnnouncementVisible(true);
        return { kind: 'result' };
      }

      setIsResultPrevious(result !== undefined);
      if (apiResult.kind === 'validation-error') {
        const backendErrors = getBackendValidationErrors(apiResult.fields, snapshot);
        setErrors(backendErrors);
        setIsValidationSummaryVisible(true);
        const firstErrorField = getFirstErrorField(backendErrors);
        return firstErrorField === undefined
          ? { kind: 'api-error' }
          : { kind: 'field', field: firstErrorField };
      }

      setApiErrorMessage(getApiErrorMessage(apiResult));
      return { kind: 'api-error' };
    } catch {
      if (
        !isMountedRef.current ||
        controller.signal.aborted ||
        requestSequence !== requestSequenceRef.current
      ) {
        return { kind: 'none' };
      }
      setIsResultPrevious(result !== undefined);
      setApiErrorMessage(GENERIC_PROPOSAL_ERROR_MESSAGE);
      return { kind: 'api-error' };
    } finally {
      if (isMountedRef.current && requestSequence === requestSequenceRef.current) {
        setIsSubmitting(false);
        activeRequestRef.current = undefined;
      }
    }
  }

  return {
    values,
    errors,
    isValidationSummaryVisible,
    isSubmitting,
    apiErrorMessage,
    result,
    isResultPrevious,
    isResultAnnouncementVisible,
    updateField,
    validateField,
    submit,
  };
}
