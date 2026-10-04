/**
 * B1 — a staging CSV that vanishes mid-run must fail legibly.
 *
 * Only tables with rows > 0 enter the COPY manifest (csv-generator.ts), so a
 * manifest entry whose file is absent was written during this run and removed
 * since — a second `axodex analyze` on the same repo (both use
 * `.axodex/csv`) or an external cleanup of `.axodex/`.
 *
 * Raw, the operator gets two engine-level messages naming neither cause nor
 * remedy: "Binder exception: No file found that matches the pattern
 * .axodex/csv/file.csv", then "ENOENT .axodex/csv/rel_Folder_File.csv".
 * Both appear verbatim in the upstream field reports on a forced rebuild.
 */
import { describe, it, expect } from 'vitest';
import { missingStagingCsvError } from '../../src/core/lbug/lbug-adapter.js';

describe('missing staging CSV (B1)', () => {
  const err = missingStagingCsvError('File', '/repo/.axodex/csv/file.csv', 23009);

  it('names the table and the exact path that is missing', () => {
    expect(err.message).toContain('File');
    expect(err.message).toContain('/repo/.axodex/csv/file.csv');
  });

  it('reports how much was staged, so the loss is quantified not vague', () => {
    expect(err.message).toContain('23,009');
  });

  it('states that the file existed during this run — not that it was never built', () => {
    // The distinction matters: "never written" would send the operator hunting
    // a generation bug, when the real cause is removal after the fact.
    expect(err.message).toMatch(/removed mid-run|during this run/);
  });

  it('names both causes the field reports point at', () => {
    expect(err.message).toContain('axodex analyze');
    expect(err.message).toContain('.axodex/csv');
  });

  it('ends in an action, not just a diagnosis', () => {
    expect(err.message).toContain('--force');
  });

  it('formats the relationship-pair case too (the rel_Folder_File ENOENT)', () => {
    const relErr = missingStagingCsvError(
      'Folder -> File',
      '/repo/.axodex/csv/rel_Folder_File.csv',
      120,
    );
    expect(relErr.message).toContain('Folder -> File');
    expect(relErr.message).toContain('rel_Folder_File.csv');
  });
});
