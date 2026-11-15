interface JsonHttpRequestBase {
  path: string;
  signal: AbortSignal;
}

export type JsonHttpRequest = JsonHttpRequestBase &
  ({ method: 'GET' } | { method: 'POST'; body: unknown });

export interface JsonHttpResponse {
  status: number;
  isJson: boolean;
  body: unknown;
}

export interface JsonHttpClient {
  request(request: JsonHttpRequest): Promise<JsonHttpResponse>;
}

async function parseJsonResponse(
  response: Response,
): Promise<Pick<JsonHttpResponse, 'isJson' | 'body'>> {
  const contentType = response.headers.get('content-type');
  if (!contentType?.toLowerCase().includes('application/json')) {
    return { isJson: false, body: null };
  }

  try {
    const body: unknown = await response.json();
    return { isJson: true, body };
  } catch {
    return { isJson: false, body: null };
  }
}

export const fetchJsonHttpClient: JsonHttpClient = {
  async request(request) {
    const response = await fetch(
      request.path,
      request.method === 'GET'
        ? { method: 'GET', signal: request.signal }
        : {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(request.body),
            signal: request.signal,
          },
    );
    const parsedResponse = await parseJsonResponse(response);

    return {
      status: response.status,
      ...parsedResponse,
    };
  },
};
