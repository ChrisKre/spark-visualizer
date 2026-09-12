// Shared test utility — builds a full RunConfig from a deep-partial override, since
// `Partial<RunConfig>` only makes top-level fields optional, not nested ones. Used across this
// package's test files; not part of the public API (not re-exported from index.ts).

import { DEFAULT_RUN_CONFIG } from './config';
import type { RunConfig } from '../types';

export interface RunConfigOverrides {
  cluster?: Partial<RunConfig['cluster']>;
  sql?: Partial<Omit<RunConfig['sql'], 'adaptive'>> & { adaptive?: Partial<RunConfig['sql']['adaptive']> };
  data?: Partial<RunConfig['data']>;
  query?: RunConfig['query'];
}

export function testConfig(overrides: RunConfigOverrides = {}): RunConfig {
  return {
    cluster: { ...DEFAULT_RUN_CONFIG.cluster, ...overrides.cluster },
    sql: {
      ...DEFAULT_RUN_CONFIG.sql,
      ...overrides.sql,
      adaptive: { ...DEFAULT_RUN_CONFIG.sql.adaptive, ...overrides.sql?.adaptive },
    },
    data: { ...DEFAULT_RUN_CONFIG.data, ...overrides.data },
    query: overrides.query ?? DEFAULT_RUN_CONFIG.query,
  };
}
