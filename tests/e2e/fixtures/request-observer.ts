import type { Page, Request } from '@playwright/test';

export type RequestCategory =
  'frontend-document' | 'frontend-static' | 'known-api' | 'other-api' | 'out-of-origin';

export type RequestOutcome = 'aborted' | 'failed' | 'finished';

export interface RequestObservation {
  category: RequestCategory;
  method: 'GET' | 'POST' | 'OTHER';
  outcome: RequestOutcome;
}

function classifyMethod(method: string): RequestObservation['method'] {
  if (method === 'GET' || method === 'POST') {
    return method;
  }
  return 'OTHER';
}

function classifyFailure(request: Request): RequestOutcome {
  const errorText = request.failure()?.errorText.toLowerCase() ?? '';
  return errorText.includes('aborted') || errorText.includes('cancelled') ? 'aborted' : 'failed';
}

export function observeRequests(page: Page, classify: (request: Request) => RequestCategory) {
  const categories = new WeakMap<Request, RequestCategory>();
  const observations: RequestObservation[] = [];

  page.on('request', (request) => {
    categories.set(request, classify(request));
  });
  page.on('requestfinished', (request) => {
    observations.push({
      category: categories.get(request) ?? 'out-of-origin',
      method: classifyMethod(request.method()),
      outcome: 'finished',
    });
  });
  page.on('requestfailed', (request) => {
    observations.push({
      category: categories.get(request) ?? 'out-of-origin',
      method: classifyMethod(request.method()),
      outcome: classifyFailure(request),
    });
  });

  return {
    snapshot: () => observations.map((observation) => ({ ...observation })),
  };
}
