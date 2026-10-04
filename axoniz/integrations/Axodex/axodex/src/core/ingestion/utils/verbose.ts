import { parseTruthyEnv } from './env.js';

export const isVerboseIngestionEnabled = (): boolean =>
  parseTruthyEnv(process.env.AXODEX_VERBOSE);
