import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ApplicationHeader } from '../../../shared/components/ApplicationHeader.tsx';
import type {
  SharedHistoryApiClient,
  TechnologyHistoryApiResult,
  TechnologyListApiResult,
} from '../api/sharedHistoryApi.ts';
import { SharedHistoryPage } from './SharedHistoryPage.tsx';

const technologies = [
  { technologyId: '2', technologyName: 'Vue' },
  { technologyId: '1', technologyName: 'React' },
];

const historyResult = {
  technologyId: '2',
  technologyName: 'Vue',
  sharedHistories: [
    {
      historyId: '20',
      createdAt: '2026-01-02T03:04:05Z',
      createdAtLabel: '2026年1月2日 03:04',
      difficulty: '2' as const,
      difficultyLabel: '中級' as const,
      durationHours: 4,
      purpose: '1' as const,
      purposeLabel: '技術習得' as const,
    },
    {
      historyId: '19',
      createdAt: '2026-01-01T03:04:05Z',
      createdAtLabel: '2026年1月1日 03:04',
      difficulty: '1' as const,
      difficultyLabel: '初級' as const,
      durationHours: 2,
      purpose: '2' as const,
      purposeLabel: 'PoC' as const,
    },
  ],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createApiClient(overrides: Partial<SharedHistoryApiClient> = {}): SharedHistoryApiClient {
  return {
    listTechnologies: vi.fn().mockResolvedValue({ kind: 'success', technologies }),
    listHistories: vi.fn().mockResolvedValue({ kind: 'success', result: historyResult }),
    getHistoryDetail: vi.fn().mockResolvedValue({ kind: 'not-found' }),
    ...overrides,
  };
}

function RouterProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <div aria-label="current URL">{`${location.pathname}${location.search}`}</div>
      <button
        type="button"
        onClick={() => {
          void navigate(-1);
        }}
      >
        Test Back
      </button>
      <button
        type="button"
        onClick={() => {
          void navigate(1);
        }}
      >
        Test Forward
      </button>
    </div>
  );
}

function renderPage(apiClient: SharedHistoryApiClient, initialEntry = '/shared-histories') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ApplicationHeader />
      <RouterProbe />
      <main>
        <Routes>
          <Route path="/shared-histories" element={<SharedHistoryPage apiClient={apiClient} />} />
          <Route path="/shared-histories/:historyId" element={<h1>履歴詳細</h1>} />
        </Routes>
      </main>
    </MemoryRouter>,
  );
}

describe('SharedHistoryPage', () => {
  it('loads technologies in backend order and waits without loading histories', async () => {
    const listHistories = vi
      .fn<SharedHistoryApiClient['listHistories']>()
      .mockResolvedValue({ kind: 'success', result: historyResult });
    const apiClient = createApiClient({ listHistories });
    renderPage(apiClient);

    expect(screen.getByRole('heading', { level: 1, name: '共有履歴' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('技術を読み込んでいます');
    const select = screen.getByRole<HTMLSelectElement>('combobox', { name: '技術' });
    expect(select.disabled).toBe(true);

    await waitFor(() => {
      expect(select.disabled).toBe(false);
    });
    expect([...select.options].map(({ text }) => text)).toEqual([
      '技術を選択してください',
      'Vue',
      'React',
    ]);
    expect(screen.queryByRole('region', { name: '共有履歴の取得結果' })).toBeNull();
    expect(listHistories).not.toHaveBeenCalled();
    expect(document.title).toBe('共有履歴 | Dev Menu');
  });

  it('shows a dedicated empty state when no technologies exist', async () => {
    const listHistories = vi.fn<SharedHistoryApiClient['listHistories']>();
    renderPage(
      createApiClient({
        listTechnologies: vi.fn().mockResolvedValue({ kind: 'success', technologies: [] }),
        listHistories,
      }),
    );

    expect(await screen.findByText('共有履歴のある技術はまだありません。')).toBeTruthy();
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: '技術' }).disabled).toBe(true);
    expect(listHistories).not.toHaveBeenCalled();
  });

  it('restores a valid URL selection and renders all histories in response order', async () => {
    const listHistories = vi
      .fn<SharedHistoryApiClient['listHistories']>()
      .mockResolvedValue({ kind: 'success', result: historyResult });
    const apiClient = createApiClient({ listHistories });
    renderPage(apiClient, '/shared-histories?technologyId=2');

    expect(await screen.findByRole('heading', { name: '「Vue」の共有履歴' })).toBeTruthy();
    const select = screen.getByRole<HTMLSelectElement>('combobox', { name: '技術' });
    expect(select.value).toBe('2');
    expect(listHistories).toHaveBeenCalledWith('2', expect.any(AbortSignal));
    const links = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('/shared-histories/'));
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/shared-histories/20',
      '/shared-histories/19',
    ]);
    expect(screen.getByText('中級')).toBeTruthy();
    expect(screen.getByText('PoC')).toBeTruthy();
    expect(screen.getByText('2026年1月2日 03:04').closest('time')?.dateTime).toBe(
      '2026-01-02T03:04:05Z',
    );
  });

  it.each(['01', '3'])(
    'removes invalid or unavailable parameter %s without requesting histories and focuses the message',
    async (technologyId) => {
      const listHistories = vi
        .fn<SharedHistoryApiClient['listHistories']>()
        .mockResolvedValue({ kind: 'success', result: historyResult });
      const apiClient = createApiClient({ listHistories });
      renderPage(apiClient, `/shared-histories?technologyId=${technologyId}`);

      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toContain('選択した技術は見つかりませんでした');
      await waitFor(() => {
        expect(screen.getByLabelText('current URL').textContent).toBe('/shared-histories');
      });
      expect(listHistories).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(document.activeElement).toBe(alert);
      });
    },
  );

  it('pushes a different selection, disables the select while loading, and shows an empty state', async () => {
    const user = userEvent.setup();
    const pending = deferred<TechnologyHistoryApiResult>();
    const listHistories = vi
      .fn<SharedHistoryApiClient['listHistories']>()
      .mockImplementation(() => pending.promise);
    const apiClient = createApiClient({ listHistories });
    renderPage(apiClient);
    const select = await screen.findByRole<HTMLSelectElement>('combobox', { name: '技術' });
    await waitFor(() => {
      expect(select.disabled).toBe(false);
    });

    await user.selectOptions(select, '2');
    expect(screen.getByLabelText('current URL').textContent).toBe(
      '/shared-histories?technologyId=2',
    );
    expect(select.disabled).toBe(true);
    expect(screen.getByText('共有履歴を読み込んでいます。')).toBeTruthy();
    select.blur();
    expect(document.activeElement).toBe(document.body);

    await act(async () => {
      pending.resolve({
        kind: 'success',
        result: { technologyId: '2', technologyName: 'Vue', sharedHistories: [] },
      });
      await pending.promise;
    });
    expect(await screen.findByText('この技術の共有履歴はありません。')).toBeTruthy();
    expect(select.disabled).toBe(false);
    expect(document.activeElement).toBe(select);

    await user.selectOptions(select, '2');
    expect(listHistories).toHaveBeenCalledTimes(1);
  });

  it('returns focus to the select after a pending history request succeeds', async () => {
    const user = userEvent.setup();
    const pending = deferred<TechnologyHistoryApiResult>();
    const listHistories = vi
      .fn<SharedHistoryApiClient['listHistories']>()
      .mockImplementation(() => pending.promise);
    renderPage(createApiClient({ listHistories }));
    const select = await screen.findByRole<HTMLSelectElement>('combobox', { name: '技術' });
    await waitFor(() => {
      expect(select.disabled).toBe(false);
    });

    await user.selectOptions(select, '2');
    expect(select.disabled).toBe(true);
    select.blur();
    expect(document.activeElement).toBe(document.body);

    await act(async () => {
      pending.resolve({ kind: 'success', result: historyResult });
      await pending.promise;
    });
    expect(await screen.findByRole('heading', { name: '「Vue」の共有履歴' })).toBeTruthy();
    expect(select.disabled).toBe(false);
    expect(document.activeElement).toBe(select);
  });

  it('does not take focus from another element when a history request succeeds', async () => {
    const user = userEvent.setup();
    const pending = deferred<TechnologyHistoryApiResult>();
    const listHistories = vi
      .fn<SharedHistoryApiClient['listHistories']>()
      .mockImplementation(() => pending.promise);
    renderPage(createApiClient({ listHistories }));
    const select = await screen.findByRole<HTMLSelectElement>('combobox', { name: '技術' });
    await waitFor(() => {
      expect(select.disabled).toBe(false);
    });

    await user.selectOptions(select, '2');
    const pageHeading = screen.getByRole('heading', { name: '共有履歴', level: 1 });
    pageHeading.focus();

    await act(async () => {
      pending.resolve({ kind: 'success', result: historyResult });
      await pending.promise;
    });
    expect(await screen.findByRole('heading', { name: '「Vue」の共有履歴' })).toBeTruthy();
    expect(document.activeElement).toBe(pageHeading);
  });

  it('synchronizes the selection and requests across browser back and forward', async () => {
    const user = userEvent.setup();
    const listHistories = vi
      .fn<SharedHistoryApiClient['listHistories']>()
      .mockImplementation((technologyId) =>
        Promise.resolve({
          kind: 'success',
          result: {
            technologyId,
            technologyName: technologyId === '2' ? 'Vue' : 'React',
            sharedHistories: [],
          },
        }),
      );
    renderPage(createApiClient({ listHistories }));
    const select = await screen.findByRole<HTMLSelectElement>('combobox', { name: '技術' });
    await waitFor(() => {
      expect(select.disabled).toBe(false);
    });

    await user.selectOptions(select, '2');
    await screen.findByText('この技術の共有履歴はありません。');
    await user.selectOptions(select, '1');
    await waitFor(() => {
      expect(select.value).toBe('1');
    });

    await user.click(screen.getByRole('button', { name: 'Test Back' }));
    await waitFor(() => {
      expect(select.value).toBe('2');
    });
    expect(screen.getByLabelText('current URL').textContent).toBe(
      '/shared-histories?technologyId=2',
    );

    await user.click(screen.getByRole('button', { name: 'Test Forward' }));
    await waitFor(() => {
      expect(select.value).toBe('1');
    });
    expect(listHistories).toHaveBeenCalledTimes(4);
  });

  it('clears an API-invalid selection and reloads technologies', async () => {
    const listTechnologies = vi
      .fn<SharedHistoryApiClient['listTechnologies']>()
      .mockResolvedValue({ kind: 'success', technologies });
    const listHistories = vi
      .fn<SharedHistoryApiClient['listHistories']>()
      .mockResolvedValue({ kind: 'invalid-selection' });
    renderPage(
      createApiClient({ listTechnologies, listHistories }),
      '/shared-histories?technologyId=2',
    );

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('選択した技術は見つかりませんでした');
    await waitFor(() => {
      expect(screen.getByLabelText('current URL').textContent).toBe('/shared-histories');
      expect(listTechnologies).toHaveBeenCalledTimes(2);
    });
  });

  it('aborts a pending history request when browser history changes selection', async () => {
    const user = userEvent.setup();
    const pending = deferred<TechnologyHistoryApiResult>();
    let historySignal: AbortSignal | undefined;
    const listHistories = vi
      .fn<SharedHistoryApiClient['listHistories']>()
      .mockImplementation((_technologyId, signal) => {
        historySignal = signal;
        return pending.promise;
      });
    renderPage(createApiClient({ listHistories }));
    const select = await screen.findByRole<HTMLSelectElement>('combobox', { name: '技術' });
    await waitFor(() => {
      expect(select.disabled).toBe(false);
    });

    await user.selectOptions(select, '2');
    expect(await screen.findByText('共有履歴を読み込んでいます。')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Test Back' }));

    await waitFor(() => {
      expect(historySignal?.aborted).toBe(true);
      expect(select.value).toBe('');
    });
    await act(async () => {
      pending.resolve({ kind: 'success', result: historyResult });
      await pending.promise;
    });
    expect(screen.queryByRole('region', { name: '共有履歴の取得結果' })).toBeNull();
    expect(screen.queryByRole('heading', { name: '「Vue」の共有履歴' })).toBeNull();
  });

  it('retries a technology error and a history error without exposing backend details', async () => {
    const user = userEvent.setup();
    const listTechnologies = vi
      .fn<SharedHistoryApiClient['listTechnologies']>()
      .mockResolvedValueOnce({ kind: 'generic-error' })
      .mockResolvedValue({ kind: 'success', technologies });
    const listHistories = vi
      .fn<SharedHistoryApiClient['listHistories']>()
      .mockResolvedValueOnce({ kind: 'generic-error' })
      .mockResolvedValue({ kind: 'success', result: historyResult });
    renderPage(
      createApiClient({ listTechnologies, listHistories }),
      '/shared-histories?technologyId=2',
    );

    let alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('技術一覧を読み込めませんでした');
    await waitFor(() => {
      expect(document.activeElement).toBe(alert);
    });
    await user.click(screen.getByRole('button', { name: 'もう一度読み込む' }));

    alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('共有履歴を読み込めませんでした');
    expect(alert.textContent).not.toContain('DB9999');
    await user.click(screen.getByRole('button', { name: 'もう一度読み込む' }));

    expect(await screen.findByRole('heading', { name: '「Vue」の共有履歴' })).toBeTruthy();
    expect(listTechnologies).toHaveBeenCalledTimes(2);
    expect(listHistories).toHaveBeenCalledTimes(2);
  });

  it('maps a rejected history request to the retryable history error', async () => {
    renderPage(
      createApiClient({ listHistories: vi.fn().mockRejectedValue(new Error('network')) }),
      '/shared-histories?technologyId=2',
    );

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('共有履歴を読み込めませんでした');
    await waitFor(() => {
      expect(document.activeElement).toBe(alert);
    });
  });

  it('maps a rejected technology request to the retryable technology error', async () => {
    renderPage(
      createApiClient({ listTechnologies: vi.fn().mockRejectedValue(new Error('network')) }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('技術一覧を読み込めませんでした');
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: '技術' }).disabled).toBe(true);
    await waitFor(() => {
      expect(document.activeElement).toBe(alert);
    });
  });

  it('returns to awaiting selection when the placeholder is selected', async () => {
    const user = userEvent.setup();
    renderPage(createApiClient(), '/shared-histories?technologyId=2');
    await screen.findByRole('heading', { name: '「Vue」の共有履歴' });
    const select = screen.getByRole<HTMLSelectElement>('combobox', { name: '技術' });

    await user.selectOptions(select, '');

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: '共有履歴の取得結果' })).toBeNull();
    });
    expect(screen.getByLabelText('current URL').textContent).toBe('/shared-histories');
  });

  it('navigates from the whole history item link to the detail route', async () => {
    const user = userEvent.setup();
    renderPage(createApiClient(), '/shared-histories?technologyId=2');
    const link = await screen.findByRole('link', { name: /2026年1月2日 03:04/ });
    await user.click(link);

    expect(screen.getByRole('heading', { name: '履歴詳細' })).toBeTruthy();
    expect(screen.getByLabelText('current URL').textContent).toBe('/shared-histories/20');
  });

  it('aborts the technology request when the page unmounts', () => {
    const pending = deferred<TechnologyListApiResult>();
    let signal: AbortSignal | undefined;
    const listTechnologies = vi
      .fn<SharedHistoryApiClient['listTechnologies']>()
      .mockImplementation((requestSignal) => {
        signal = requestSignal;
        return pending.promise;
      });
    const apiClient = createApiClient({
      listTechnologies,
    });
    const view = renderPage(apiClient);

    view.unmount();
    expect(signal?.aborted).toBe(true);
  });
});
