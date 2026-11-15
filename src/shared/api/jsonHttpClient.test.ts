import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchJsonHttpClient } from './jsonHttpClient.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchJsonHttpClient', () => {
  it('sends a GET without a request body or content type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await expect(
      fetchJsonHttpClient.request({
        path: '/resource',
        method: 'GET',
        signal: controller.signal,
      }),
    ).resolves.toEqual({ status: 200, isJson: true, body: { ok: true } });
    expect(fetchMock).toHaveBeenCalledWith('/resource', {
      method: 'GET',
      signal: controller.signal,
    });
  });

  it('sends JSON and parses a JSON response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await expect(
      fetchJsonHttpClient.request({
        path: '/resource',
        method: 'POST',
        body: { value: 1 },
        signal: controller.signal,
      }),
    ).resolves.toEqual({ status: 200, isJson: true, body: { ok: true } });
    expect(fetchMock).toHaveBeenCalledWith('/resource', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 1 }),
      signal: controller.signal,
    });
  });

  it.each([
    new Response('plain text', { status: 500, headers: { 'Content-Type': 'text/plain' } }),
    new Response('{invalid', { status: 500, headers: { 'Content-Type': 'application/json' } }),
  ])('treats a non-JSON body as opaque', async (response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await expect(
      fetchJsonHttpClient.request({
        path: '/resource',
        method: 'POST',
        body: {},
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ status: 500, isJson: false, body: null });
  });
});
