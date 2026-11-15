import { requireRealSystemGates } from './environment-gates.ts';
import { requireEnvironment } from '../helpers/environment.ts';

const PUBLIC_ID_PATTERN = /^[1-9][0-9]{0,18}$/;

export interface RealSystemInputs {
  technologyInput: string;
  normalizedTechnologyName: string;
  fixtureTechnologyName: string;
  technologyId: string;
  historyId: string;
  orderedHistoryIds: readonly string[];
}

function requirePublicId(name: string) {
  const value = requireEnvironment(name);
  if (!PUBLIC_ID_PATTERN.test(value)) {
    throw new Error(`Required integration test input ${name} is not a valid public ID.`);
  }
  return value;
}

export function loadRealSystemInputs(): RealSystemInputs {
  requireRealSystemGates(process.env);
  const orderedHistoryIds = requireEnvironment('E2E_REAL_ORDERED_HISTORY_IDS').split(',');
  if (
    orderedHistoryIds.length === 0 ||
    orderedHistoryIds.some((value) => !PUBLIC_ID_PATTERN.test(value))
  ) {
    throw new Error('Required integration test input E2E_REAL_ORDERED_HISTORY_IDS is invalid.');
  }

  return {
    technologyInput: requireEnvironment('E2E_REAL_TECHNOLOGY_INPUT'),
    normalizedTechnologyName: requireEnvironment('E2E_REAL_TECHNOLOGY_NAME'),
    fixtureTechnologyName: requireEnvironment('E2E_REAL_FIXTURE_TECHNOLOGY_NAME'),
    technologyId: requirePublicId('E2E_REAL_TECHNOLOGY_ID'),
    historyId: requirePublicId('E2E_REAL_HISTORY_ID'),
    orderedHistoryIds,
  };
}
