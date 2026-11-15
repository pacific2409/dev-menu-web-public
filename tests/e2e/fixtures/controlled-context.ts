import type { Browser, BrowserContext, Page, Request, Route } from '@playwright/test';

import type { ControlledResponse } from './contract-response-builders.ts';

export interface ControlledRouteDefinition {
  endpoint: RegExp | string;
  classification:
    ControlledResponse['classification'] | readonly ControlledResponse['classification'][];
  response:
    ControlledResponse | ((request: Request) => ControlledResponse | Promise<ControlledResponse>);
  onFulfilled?: (request: Request) => void;
}

export interface ControlledContext {
  context: BrowserContext;
  registeredRouteCount: number;
  responseClassifications: readonly ControlledResponse['classification'][];
  close: () => Promise<void>;
}

async function fulfillControlledRoute(route: Route, response: ControlledResponse) {
  if (response.kind === 'network-failure') {
    await route.abort(response.failureCode);
    return;
  }

  if (response.kind === 'text') {
    await route.fulfill({
      status: response.status,
      contentType: 'text/plain',
      body: response.body,
    });
    return;
  }

  await route.fulfill({
    status: response.status,
    contentType: 'application/json',
    json: response.body,
  });
}

export async function createControlledContext(
  browser: Browser,
  definitions: readonly ControlledRouteDefinition[],
  baseURL?: string,
): Promise<ControlledContext> {
  if (definitions.length === 0) {
    throw new Error('Controlled integration requires at least one intercepted endpoint.');
  }

  const context = await browser.newContext(baseURL === undefined ? {} : { baseURL });
  for (const definition of definitions) {
    const classifications = Array.isArray(definition.classification)
      ? definition.classification
      : [definition.classification];
    if (classifications.includes('network-failure')) {
      // Network failure is a distinct evidence classification and must match the response kind.
      const response = typeof definition.response === 'function' ? undefined : definition.response;
      if (
        response !== undefined &&
        response.kind !== 'network-failure' &&
        classifications.length === 1
      ) {
        await context.close();
        throw new Error('Controlled route classification does not match its response kind.');
      }
    }

    await context.route(definition.endpoint, async (route) => {
      const response =
        typeof definition.response === 'function'
          ? await definition.response(route.request())
          : definition.response;
      if (!classifications.includes(response.classification)) {
        throw new Error('Controlled route returned an unexpected response classification.');
      }
      await fulfillControlledRoute(route, response);
      definition.onFulfilled?.(route.request());
    });
  }

  let closed = false;
  return {
    context,
    registeredRouteCount: definitions.length,
    responseClassifications: definitions.flatMap(({ classification }) => classification),
    close: async () => {
      if (closed) {
        return;
      }
      closed = true;
      await context.unrouteAll({ behavior: 'wait' });
      await context.close();
    },
  };
}

export async function withControlledPage(
  browser: Browser,
  baseURL: string,
  definitions: readonly ControlledRouteDefinition[],
  run: (page: Page, controlled: ControlledContext) => Promise<void>,
) {
  const controlled = await createControlledContext(browser, definitions, baseURL);
  const page = await controlled.context.newPage();
  try {
    await run(page, controlled);
  } finally {
    await controlled.close();
  }
}
