import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ApplicationHeader } from '../../../shared/components/ApplicationHeader.tsx';
import type {
  PracticeProposalApiClient,
  PracticeProposalApiResult,
} from '../api/practiceProposalApi.ts';
import type { PracticeProposalResultModel } from '../model/practiceProposal.ts';
import { PracticeProposalPage } from './PracticeProposalPage.tsx';

const result: PracticeProposalResultModel = {
  conditions: {
    technologyName: 'React',
    difficulty: '2',
    durationHours: 12,
    purpose: '1',
    additionalPreference: null,
  },
  practiceProposals: [1, 2, 3].map((proposalNumber) => ({
    proposalNumber: proposalNumber as 1 | 2 | 3,
    title: `課題${String(proposalNumber)}`,
    overview: `概要${String(proposalNumber)}`,
    achievementGoal: `達成目標${String(proposalNumber)}`,
    practiceFocus: `学ぶポイント${String(proposalNumber)}`,
  })) as PracticeProposalResultModel['practiceProposals'],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function apiClientWith(create: PracticeProposalApiClient['create']): PracticeProposalApiClient {
  return { create };
}

function renderPage(apiClient: PracticeProposalApiClient) {
  return render(
    <MemoryRouter>
      <ApplicationHeader />
      <main>
        <PracticeProposalPage apiClient={apiClient} />
      </main>
    </MemoryRouter>,
  );
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/学びたい技術/), 'React');
  await user.selectOptions(screen.getByLabelText(/難易度/), '2');
  await user.type(screen.getByLabelText(/取り組める時間/), '12');
  await user.selectOptions(screen.getByLabelText(/目的/), '1');
}

describe('PracticeProposalPage', () => {
  it('renders the public order form with its navigation, five fields, and guidance', async () => {
    const user = userEvent.setup();
    renderPage(apiClientWith(vi.fn()));

    expect(document.title).toBe('課題を注文 | Dev Menu');
    expect(screen.getByRole('heading', { level: 1, name: '課題を注文' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'メインナビゲーション' })).toBeTruthy();
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    expect(screen.getByRole('spinbutton')).toBeTruthy();
    expect(screen.getByText(/ログインなしで共有履歴から閲覧できます/)).toBeTruthy();

    await user.selectOptions(screen.getByLabelText(/難易度/), '3');
    expect(screen.getByText(/複雑な課題で複数の選択肢を評価/)).toBeTruthy();
    await user.type(screen.getByLabelText(/その他の希望/), 'A😀');
    expect(screen.getByText('2 / 200')).toBeTruthy();
  });

  it('validates on blur and focuses the first invalid field on submit', async () => {
    const user = userEvent.setup();
    const create = vi.fn();
    renderPage(apiClientWith(create));
    const technology = screen.getByLabelText(/学びたい技術/);

    await user.click(technology);
    await user.tab();
    expect(screen.getByText('学びたい技術を入力してください。')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '課題を提案してもらう' }));

    expect(screen.getByRole('alert', { name: '入力エラー' })).toBeTruthy();
    expect(document.activeElement).toBe(technology);
    expect(create).not.toHaveBeenCalled();
  });

  it('focuses the result after correcting an invalid submission', async () => {
    const user = userEvent.setup();
    const create = vi.fn().mockResolvedValue({ kind: 'success', result });
    renderPage(apiClientWith(create));
    const technology = screen.getByLabelText(/学びたい技術/);
    const submit = screen.getByRole('button', { name: '課題を提案してもらう' });

    await user.click(submit);
    expect(document.activeElement).toBe(technology);
    expect(create).not.toHaveBeenCalled();

    await fillValidForm(user);
    await user.click(submit);

    const resultHeading = await screen.findByRole('heading', { name: '提案された課題' });
    await waitFor(() => {
      expect(document.activeElement).toBe(resultHeading);
    });
    expect(create).toHaveBeenCalledOnce();
  });

  it('disables the form while submitting, then renders and focuses three proposals', async () => {
    const user = userEvent.setup();
    const pending = deferred<PracticeProposalApiResult>();
    const create = vi.fn(() => pending.promise);
    renderPage(apiClientWith(create));
    await fillValidForm(user);

    await user.click(screen.getByRole('button', { name: '課題を提案してもらう' }));
    expect(screen.getByText(/課題を考えています/).closest('[role="status"]')).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>(/学びたい技術/).disabled).toBe(true);
    expect(create).toHaveBeenCalledWith(
      {
        technologyName: 'React',
        difficulty: '2',
        durationHours: 12,
        purpose: '1',
        additionalPreference: null,
      },
      expect.any(AbortSignal),
    );

    await act(async () => {
      pending.resolve({ kind: 'success', result });
      await pending.promise;
    });
    const resultHeading = await screen.findByRole('heading', { name: '提案された課題' });
    expect(screen.getByRole('list', { name: '提案された3件の課題' }).children).toHaveLength(3);
    expect(screen.getByText('指定なし')).toBeTruthy();
    expect(document.activeElement).toBe(resultHeading);
    expect(screen.getByText('3件の課題を提案しました。')).toBeTruthy();
  });

  it('keeps the prior result during resubmission and after a generation error', async () => {
    const user = userEvent.setup();
    const second = deferred<PracticeProposalApiResult>();
    const create = vi
      .fn<PracticeProposalApiClient['create']>()
      .mockResolvedValueOnce({ kind: 'success', result })
      .mockImplementationOnce(() => second.promise);
    renderPage(apiClientWith(create));
    await fillValidForm(user);
    const submit = screen.getByRole('button', { name: '課題を提案してもらう' });

    await user.click(submit);
    await screen.findByRole('heading', { name: '提案された課題' });
    await user.click(submit);
    expect(screen.getByText('前回成功した提案')).toBeTruthy();

    await act(async () => {
      second.resolve({ kind: 'generation-error' });
      await second.promise;
    });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('条件を変えて、もう一度お試しください');
    expect(screen.getByRole('heading', { name: '提案された課題' })).toBeTruthy();
    expect(document.activeElement).toBe(alert);
  });

  it('replaces the prior result only after a successful resubmission', async () => {
    const user = userEvent.setup();
    const replacement: PracticeProposalResultModel = {
      ...result,
      practiceProposals: result.practiceProposals.map((proposal) => ({
        ...proposal,
        title: `新しい${proposal.title}`,
      })) as PracticeProposalResultModel['practiceProposals'],
    };
    const create = vi
      .fn<PracticeProposalApiClient['create']>()
      .mockResolvedValueOnce({ kind: 'success', result })
      .mockResolvedValueOnce({ kind: 'success', result: replacement });
    renderPage(apiClientWith(create));
    await fillValidForm(user);
    const submit = screen.getByRole('button', { name: '課題を提案してもらう' });

    await user.click(submit);
    expect(await screen.findByRole('heading', { name: '課題1' })).toBeTruthy();
    await user.click(submit);

    expect(await screen.findByRole('heading', { name: '新しい課題1' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: '課題1' })).toBeNull();
    expect(screen.queryByText('前回成功した提案')).toBeNull();
  });

  it('uses the purpose-specific focus label for a PoC result', async () => {
    const user = userEvent.setup();
    const pocResult: PracticeProposalResultModel = {
      ...result,
      conditions: { ...result.conditions, purpose: '2' },
    };
    renderPage(apiClientWith(vi.fn().mockResolvedValue({ kind: 'success', result: pocResult })));
    await fillValidForm(user);
    await user.selectOptions(screen.getByLabelText(/目的/), '2');
    await user.click(screen.getByRole('button', { name: '課題を提案してもらう' }));

    expect(await screen.findAllByText('検証するポイント')).toHaveLength(3);
    expect(screen.queryByText('学ぶポイント')).toBeNull();
  });

  it('maps backend validation fields to local messages and field focus', async () => {
    const user = userEvent.setup();
    renderPage(
      apiClientWith(vi.fn().mockResolvedValue({ kind: 'validation-error', fields: ['purpose'] })),
    );
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: '課題を提案してもらう' }));

    const purpose = screen.getByLabelText(/目的/);
    await waitFor(() => {
      expect(document.activeElement).toBe(purpose);
    });
    expect(screen.getAllByText('目的を選択してください。')).toHaveLength(2);
  });

  it('shows a generic error when the request rejects', async () => {
    const user = userEvent.setup();
    renderPage(apiClientWith(vi.fn().mockRejectedValue(new Error('network'))));
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: '課題を提案してもらう' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('時間をおいて、もう一度お試しください');
  });

  it('aborts an in-flight request on unmount and ignores its late result', async () => {
    const user = userEvent.setup();
    const pending = deferred<PracticeProposalApiResult>();
    let signal: AbortSignal | undefined;
    const create: PracticeProposalApiClient['create'] = (_request, requestSignal) => {
      signal = requestSignal;
      return pending.promise;
    };
    const view = renderPage(apiClientWith(vi.fn(create)));
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: '課題を提案してもらう' }));

    view.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      pending.resolve({ kind: 'success', result });
      await pending.promise;
    });
    expect(screen.queryByRole('heading', { name: '提案された課題' })).toBeNull();
  });
});
