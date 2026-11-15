import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App.tsx';

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('routes the root URL to the practice proposal screen', () => {
    window.history.replaceState({}, '', '/');
    render(<App />);

    const heading = screen.getByRole('heading', { level: 1, name: '課題を注文' });
    expect(heading).toBeTruthy();
    expect(document.activeElement).not.toBe(heading);
    expect(screen.getByRole('navigation', { name: 'メインナビゲーション' })).toBeTruthy();
  });

  it('focuses the practice-proposal page heading after in-app navigation', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ technologies: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    window.history.replaceState({}, '', '/shared-histories');
    render(<App />);

    await user.click(screen.getByRole('link', { name: '課題を注文' }));

    const heading = await screen.findByRole('heading', { level: 1, name: '課題を注文' });
    expect(document.activeElement).toBe(heading);
  });

  it('routes the shared-history URL to the shared-history screen', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ technologies: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    window.history.replaceState({}, '', '/shared-histories');
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: '共有履歴' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'メインナビゲーション' })).toBeTruthy();
  });

  it('focuses the shared-history page heading after in-app navigation', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ technologies: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    window.history.replaceState({}, '', '/');
    render(<App />);

    await user.click(screen.getByRole('link', { name: '共有履歴' }));

    const heading = await screen.findByRole('heading', { level: 1, name: '共有履歴' });
    expect(document.activeElement).toBe(heading);
  });

  it('routes a shared-history detail URL to the detail screen', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            historyId: '20',
            createdAt: '2026-01-02T03:04:05Z',
            conditions: {
              technologyId: '2',
              technologyName: 'React',
              difficulty: '2',
              durationHours: 4,
              purpose: '1',
              additionalPreference: null,
            },
            practiceProposals: [1, 2, 3].map((proposalNumber) => ({
              proposalNumber,
              title: `課題${String(proposalNumber)}`,
              overview: '概要',
              achievementGoal: '目標',
              practiceFocus: 'ポイント',
            })),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    window.history.replaceState({}, '', '/shared-histories/20');
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: '共有履歴の詳細' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: '提案された課題' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '共有履歴' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });
});
