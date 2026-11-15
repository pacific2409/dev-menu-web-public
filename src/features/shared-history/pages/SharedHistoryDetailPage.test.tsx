import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ApplicationHeader } from '../../../shared/components/ApplicationHeader.tsx';
import type { SharedHistoryApiClient } from '../api/sharedHistoryApi.ts';
import type { SharedHistoryDetailModel } from '../model/sharedHistory.ts';
import { SharedHistoryDetailPage } from './SharedHistoryDetailPage.tsx';

const detail: SharedHistoryDetailModel = {
  historyId: '20',
  createdAt: '2026-01-02T03:04:05Z',
  createdAtLabel: '2026年1月2日 03:04',
  conditions: {
    technologyId: '2',
    technologyName: 'React',
    difficulty: '2',
    difficultyLabel: '中級',
    durationHours: 4,
    purpose: '2',
    purposeLabel: 'PoC',
    additionalPreference: '<script>安全な文字列</script>\n改行',
  },
  practiceProposals: [1, 2, 3].map((proposalNumber) => ({
    proposalNumber: proposalNumber as 1 | 2 | 3,
    title: `課題${String(proposalNumber)}`,
    overview: `概要${String(proposalNumber)}`,
    achievementGoal: `目標${String(proposalNumber)}`,
    practiceFocus: `ポイント${String(proposalNumber)}`,
  })),
};

function createApiClient(overrides: Partial<SharedHistoryApiClient> = {}): SharedHistoryApiClient {
  return {
    listTechnologies: vi.fn().mockResolvedValue({ kind: 'success', technologies: [] }),
    listHistories: vi.fn().mockResolvedValue({
      kind: 'success',
      result: { technologyId: '2', technologyName: 'React', sharedHistories: [] },
    }),
    getHistoryDetail: vi.fn().mockResolvedValue({ kind: 'success', result: detail }),
    ...overrides,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <div aria-label="current URL">{`${location.pathname}${location.search}`}</div>;
}

function renderPage(apiClient: SharedHistoryApiClient, initialEntry = '/shared-histories/20') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ApplicationHeader />
      <LocationProbe />
      <main>
        <Routes>
          <Route
            path="/shared-histories/:historyId"
            element={<SharedHistoryDetailPage apiClient={apiClient} />}
          />
          <Route path="/shared-histories" element={<h1>共有履歴一覧</h1>} />
          <Route path="/" element={<h1>課題を注文</h1>} />
        </Routes>
      </main>
    </MemoryRouter>,
  );
}

describe('SharedHistoryDetailPage', () => {
  it.each(['0', '01', '+1', '1.0', '%201', '9223372036854775808'])(
    'rejects invalid route ID %s without requesting the API',
    async (historyId) => {
      const getHistoryDetail = vi.fn<SharedHistoryApiClient['getHistoryDetail']>();
      renderPage(createApiClient({ getHistoryDetail }), `/shared-histories/${historyId}`);

      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toContain('指定されたURLが正しくありません');
      await waitFor(() => {
        expect(document.activeElement).toBe(alert);
      });
      expect(getHistoryDetail).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'もう一度読み込む' })).toBeNull();
    },
  );

  it('shows the complete detail, semantic content, safe text, and success navigation', async () => {
    const getHistoryDetail = vi
      .fn<SharedHistoryApiClient['getHistoryDetail']>()
      .mockResolvedValue({ kind: 'success', result: detail });
    renderPage(createApiClient({ getHistoryDetail }));

    expect(screen.getByRole('status').textContent).toContain('読み込んでいます');
    expect(await screen.findByRole('heading', { name: '提案された課題' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('読み込みました');
    expect(screen.getByText('2026年1月2日 03:04').closest('time')?.dateTime).toBe(
      '2026-01-02T03:04:05Z',
    );
    expect(screen.getByText('中級')).toBeTruthy();
    expect(screen.getByText('PoC')).toBeTruthy();
    expect(screen.getAllByText('検証するポイント')).toHaveLength(3);
    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName === 'DD' &&
          element.textContent === '<script>安全な文字列</script>\n改行',
      ),
    ).toBeTruthy();
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByRole('list', { name: '保存された3件の課題' }).children).toHaveLength(3);
    expect(getHistoryDetail).toHaveBeenCalledWith('20', expect.any(AbortSignal));
    expect(
      screen
        .getAllByRole('link', { name: '共有履歴へ戻る' })
        .every((link) => link.getAttribute('href') === '/shared-histories?technologyId=2'),
    ).toBe(true);
    expect(screen.getByRole('link', { name: '新しい課題を注文する' }).getAttribute('href')).toBe(
      '/',
    );
    expect(screen.getByRole('link', { name: '共有履歴' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(document.title).toBe('共有履歴の詳細 | Dev Menu');
  });

  it.each([
    ['invalid-history-id', '指定されたURLが正しくありません'],
    ['not-found', '共有履歴は見つかりませんでした'],
  ] as const)('shows the non-retryable %s state without backend details', async (kind, message) => {
    renderPage(
      createApiClient({
        getHistoryDetail: vi.fn().mockResolvedValue({ kind }),
      }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(message);
    expect(alert.textContent).not.toContain('SH0001');
    await waitFor(() => {
      expect(document.activeElement).toBe(alert);
    });
    expect(screen.queryByRole('button', { name: 'もう一度読み込む' })).toBeNull();
    expect(
      screen
        .getAllByRole('link', { name: '共有履歴へ戻る' })
        .every((link) => link.getAttribute('href') === '/shared-histories'),
    ).toBe(true);
  });

  it('retries a load error with the same ID and does not expose internal details', async () => {
    const user = userEvent.setup();
    const getHistoryDetail = vi
      .fn<SharedHistoryApiClient['getHistoryDetail']>()
      .mockResolvedValueOnce({ kind: 'generic-error' })
      .mockResolvedValueOnce({ kind: 'success', result: detail });
    renderPage(createApiClient({ getHistoryDetail }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('詳細を読み込めませんでした');
    expect(alert.textContent).not.toContain('DB9999');
    await waitFor(() => {
      expect(document.activeElement).toBe(alert);
    });
    await user.click(screen.getByRole('button', { name: 'もう一度読み込む' }));

    expect(await screen.findByRole('heading', { name: '提案された課題' })).toBeTruthy();
    expect(getHistoryDetail).toHaveBeenCalledTimes(2);
    expect(getHistoryDetail.mock.calls.map(([historyId]) => historyId)).toEqual(['20', '20']);
  });

  it('maps a rejected request to the retryable load error', async () => {
    renderPage(
      createApiClient({
        getHistoryDetail: vi.fn().mockRejectedValue(new Error('network detail')),
      }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('詳細を読み込めませんでした');
    expect(alert.textContent).not.toContain('network detail');
  });

  it('navigates back with the technology query after success and to a new order', async () => {
    const user = userEvent.setup();
    renderPage(createApiClient());
    await screen.findByRole('heading', { name: '提案された課題' });

    const lowerBackLink = screen.getAllByRole('link', { name: '共有履歴へ戻る' })[1];
    expect(lowerBackLink).toBeDefined();
    if (lowerBackLink === undefined) {
      throw new Error('Expected the lower shared-history link.');
    }
    await user.click(lowerBackLink);
    expect(screen.getByRole('heading', { name: '共有履歴一覧' })).toBeTruthy();
    expect(screen.getByLabelText('current URL').textContent).toBe(
      '/shared-histories?technologyId=2',
    );
  });

  it('aborts a pending request when the page unmounts', () => {
    let signal: AbortSignal | undefined;
    const getHistoryDetail = vi
      .fn<SharedHistoryApiClient['getHistoryDetail']>()
      .mockImplementation((_historyId, requestSignal) => {
        signal = requestSignal;
        return new Promise(() => undefined);
      });
    const view = renderPage(createApiClient({ getHistoryDetail }));

    view.unmount();
    expect(signal?.aborted).toBe(true);
  });
});
