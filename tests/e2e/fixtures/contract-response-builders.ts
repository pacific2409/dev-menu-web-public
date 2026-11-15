export type ControlledResponseClassification =
  'contract-mismatch' | 'empty' | 'known-error' | 'success' | 'unknown-error';

export interface ControlledJsonResponse {
  kind: 'json';
  classification: ControlledResponseClassification;
  status: number;
  body: Readonly<Record<string, unknown>>;
}

export interface ControlledNetworkFailure {
  kind: 'network-failure';
  classification: 'network-failure';
  failureCode: 'connectionfailed' | 'internetdisconnected' | 'timedout';
}

export interface ControlledTextResponse {
  kind: 'text';
  classification: 'contract-mismatch';
  status: number;
  body: string;
}

export type ControlledResponse =
  ControlledJsonResponse | ControlledNetworkFailure | ControlledTextResponse;

export function createJsonResponse(
  classification: ControlledResponseClassification,
  status: number,
  body: Readonly<Record<string, unknown>>,
): ControlledJsonResponse {
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    throw new Error('Controlled response contains an invalid HTTP status.');
  }

  return { kind: 'json', classification, status, body };
}

export function createNetworkFailure(
  failureCode: ControlledNetworkFailure['failureCode'],
): ControlledNetworkFailure {
  return { kind: 'network-failure', classification: 'network-failure', failureCode };
}

export function createTextResponse(status: number, body: string): ControlledTextResponse {
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    throw new Error('Controlled response contains an invalid HTTP status.');
  }
  return { kind: 'text', classification: 'contract-mismatch', status, body };
}
