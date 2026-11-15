export function proposalSuccessBody(label = 'A') {
  return {
    conditions: {
      technologyName: `Technology ${label}`,
      difficulty: '1',
      durationHours: 2,
      purpose: '1',
      additionalPreference: null,
    },
    practiceProposals: [1, 2, 3].map((proposalNumber) => ({
      proposalNumber,
      title: `Title ${label} ${String(proposalNumber)}`,
      overview: `Overview ${label} ${String(proposalNumber)}`,
      achievementGoal: `Goal ${label} ${String(proposalNumber)}`,
      practiceFocus: `Focus ${label} ${String(proposalNumber)}`,
    })),
  };
}

export function technologyListBody() {
  return {
    technologies: [
      { technologyId: '1', technologyName: 'Technology A' },
      { technologyId: '2', technologyName: 'Technology B' },
    ],
  };
}

export function historyListBody(technologyId: string, label = 'A') {
  return {
    technologyId,
    technologyName: `Technology ${label}`,
    sharedHistories: [
      {
        historyId: technologyId === '1' ? '11' : '22',
        createdAt: '2026-01-02T03:04:05Z',
        difficulty: '1',
        durationHours: 2,
        purpose: '1',
      },
    ],
  };
}

export function historyDetailBody(historyId = '20', text = 'safe text') {
  return {
    historyId,
    createdAt: '2026-01-02T03:04:05Z',
    conditions: {
      technologyId: '1',
      technologyName: 'Technology A',
      difficulty: '1',
      durationHours: 2,
      purpose: '1',
      additionalPreference: text,
    },
    practiceProposals: [1, 2, 3].map((proposalNumber) => ({
      proposalNumber,
      title: `${text} ${String(proposalNumber)}`,
      overview: text,
      achievementGoal: text,
      practiceFocus: text,
    })),
  };
}
