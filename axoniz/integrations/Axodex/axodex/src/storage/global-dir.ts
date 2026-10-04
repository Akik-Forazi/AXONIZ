import os from 'node:os';
import path from 'node:path';

/** Get the path to the global Axodex directory. */
export const getGlobalDir = (): string => {
  return process.env.AXODEX_HOME || path.join(os.homedir(), '.axodex');
};
