import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  embeddingsFromAxodexRc,
  AutoSyncAxodexRcError,
} from '../../src/core/axodex-rc-embeddings.js';

describe('embeddingsFromAxodexRc', () => {
  const dirs: string[] = [];
  const tempDir = (): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-rc-'));
    dirs.push(dir);
    return dir;
  };
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns empty when no rc file exists', async () => {
    await expect(embeddingsFromAxodexRc(tempDir())).resolves.toEqual({});
  });

  it('reads embeddings true from a committed rc', async () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, '.axodexrc'), '{"embeddings": true}');
    await expect(embeddingsFromAxodexRc(dir)).resolves.toEqual({ embeddings: true });
  });

  it('prefers nested analyze.embeddings over a conflicting top-level value', async () => {
    const dir = tempDir();
    fs.writeFileSync(
      path.join(dir, '.axodexrc'),
      '{"embeddings": false, "analyze": {"embeddings": 100}}',
    );
    await expect(embeddingsFromAxodexRc(dir)).resolves.toEqual({
      embeddings: true,
      embeddingsNodeLimit: 100,
    });
  });

  it('fails closed on invalid JSON', async () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, '.axodexrc'), '{');
    await expect(embeddingsFromAxodexRc(dir)).rejects.toThrow(AutoSyncAxodexRcError);
  });

  it('refuses a symlink .axodexrc', async () => {
    const dir = tempDir();
    const outside = path.join(dir, 'outside.json');
    fs.writeFileSync(outside, '{"embeddings": true}');
    // 'file' is required for a file symlink on Windows and ignored on other platforms.
    fs.symlinkSync(outside, path.join(dir, '.axodexrc'), 'file');
    await expect(embeddingsFromAxodexRc(dir)).rejects.toThrow(/symbolic link/);
  });
});
