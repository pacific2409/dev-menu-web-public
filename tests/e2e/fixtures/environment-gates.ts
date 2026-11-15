const SHA256_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;

export interface RealSystemGateResult {
  mode: 'real';
  dependenciesReady: true;
  fixtureContractReady: true;
  fixtureSetupReady: true;
  cleanupContractReady: true;
  imageDigestVerified: true;
}

function requireReadyFlag(value: string | undefined, gateName: string) {
  if (value !== 'true') {
    throw new Error(`${gateName} is not ready.`);
  }
  return true as const;
}

export function requireRealSystemGates(
  environment: Readonly<Record<string, string | undefined>>,
): RealSystemGateResult {
  if (environment.INTEGRATION_TEST_MODE !== 'real') {
    throw new Error('Real System Integration requires an explicit real test mode.');
  }
  if (!SHA256_DIGEST_PATTERN.test(environment.IMAGE_DIGEST ?? '')) {
    throw new Error('Real System Integration requires a verified image digest.');
  }

  return {
    mode: 'real',
    dependenciesReady: requireReadyFlag(environment.DEPENDENCIES_READY, 'Dependency gate'),
    fixtureContractReady: requireReadyFlag(
      environment.FIXTURE_CONTRACT_READY,
      'Fixture contract gate',
    ),
    fixtureSetupReady: requireReadyFlag(environment.FIXTURE_SETUP_READY, 'Fixture setup gate'),
    cleanupContractReady: requireReadyFlag(
      environment.CLEANUP_CONTRACT_READY,
      'Cleanup contract gate',
    ),
    imageDigestVerified: true,
  };
}
