import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { syncPluginManifests } from '../../scripts/sync-plugin-manifests.mjs';

const SURFACES = [
  'axodex-claude-plugin/.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  'axodex-claude-plugin/.codex-plugin/plugin.json',
  '.agents/plugins/marketplace.json',
  'axodex-factory-plugin/.factory-plugin/plugin.json',
  '.factory-plugin/marketplace.json',
] as const;

const FACTORY_MCP = 'axodex-factory-plugin/mcp.json';

const MCP_SKILL_DIRS = [
  'axodex-plan',
  'axodex-work',
  'axodex-review',
  'axodex-lfg',
  'axodex-guide',
  'axodex-cli',
  'axodex-debugging',
  'axodex-exploring',
  'axodex-impact-analysis',
  'axodex-refactoring',
] as const;

function mcpPath(dir: string): string {
  return `axodex-claude-plugin/skills/${dir}/mcp.json`;
}

const EXECUTABLE_MCP_FILES = [...MCP_SKILL_DIRS.map(mcpPath), FACTORY_MCP];

const TOTAL_SURFACES = SURFACES.length + EXECUTABLE_MCP_FILES.length;

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function writeJson(root: string, file: string, value: unknown): void {
  const filePath = path.join(root, file);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function makeRoot(packageVersion: string, manifestVersion: string): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'axodex-manifest-sync-'));
  tempRoots.push(root);
  writeJson(root, 'axodex/package.json', { name: 'axodex', version: packageVersion });
  writeJson(root, SURFACES[0], { name: 'axodex', version: manifestVersion });
  writeJson(root, SURFACES[1], {
    name: 'axodex-marketplace',
    plugins: [{ name: 'axodex', version: manifestVersion, source: './axodex-claude-plugin' }],
  });
  writeJson(root, SURFACES[2], { name: 'axodex', version: manifestVersion });
  writeJson(root, SURFACES[3], {
    name: 'axodex-marketplace',
    plugins: [{ name: 'axodex', version: manifestVersion, category: 'Developer Tools' }],
  });
  writeJson(root, SURFACES[4], { name: 'axodex', version: manifestVersion });
  writeJson(root, SURFACES[5], {
    name: 'axodex-marketplace',
    plugins: [{ name: 'axodex', version: manifestVersion, source: './axodex-factory-plugin' }],
  });
  for (const dir of EXECUTABLE_MCP_FILES) {
    writeJson(root, dir, {
      mcpServers: {
        axodex: { command: 'npx', args: ['-y', `axodex@${manifestVersion}`, 'mcp'] },
      },
    });
  }
  return root;
}

function readVersions(root: string): string[] {
  return SURFACES.map((file) => {
    const manifest = JSON.parse(readFileSync(path.join(root, file), 'utf8')) as {
      version?: string;
      plugins?: Array<{ name: string; version: string }>;
    };
    return (
      manifest.version ??
      manifest.plugins?.find((plugin) => plugin.name === 'axodex')?.version ??
      ''
    );
  });
}

describe('syncPluginManifests (#2445)', () => {
  it('rewrites every version-bearing surface to the package version and reports them', () => {
    const root = makeRoot('1.6.10-rc.29', '1.6.9');

    const result = syncPluginManifests(root);

    expect(result.version).toBe('1.6.10-rc.29');
    expect(result.synced).toHaveLength(TOTAL_SURFACES);
    expect(result.stale.map(({ from }) => from)).toEqual(Array(TOTAL_SURFACES).fill('1.6.9'));
    expect(readVersions(root)).toEqual(Array(SURFACES.length).fill('1.6.10-rc.29'));
  });

  it('pins the axodex@<version> launch arg in every executable mcp.json', () => {
    const root = makeRoot('1.6.10-rc.29', '1.6.9');

    syncPluginManifests(root);

    for (const file of EXECUTABLE_MCP_FILES) {
      const mcp = JSON.parse(readFileSync(path.join(root, file), 'utf8')) as {
        mcpServers: { axodex: { args: string[] } };
      };
      expect(mcp.mcpServers.axodex.args, file).toEqual(['-y', 'axodex@1.6.10-rc.29', 'mcp']);
    }
  });

  it('fails closed when an mcp.json has no axodex@ launch arg', () => {
    const root = makeRoot('1.6.10-rc.29', '1.6.9');
    writeJson(root, mcpPath('axodex-plan'), {
      mcpServers: { axodex: { command: 'npx', args: ['-y', 'mcp'] } },
    });

    expect(() => syncPluginManifests(root)).toThrow(/exactly one "axodex@<version>" launch arg/);
  });

  it('is idempotent once everything matches', () => {
    const root = makeRoot('1.6.10-rc.29', '1.6.9');
    syncPluginManifests(root);

    const second = syncPluginManifests(root);

    expect(second.synced).toHaveLength(0);
    expect(second.stale).toHaveLength(0);
  });

  it('check mode reports drift without writing anything', () => {
    const root = makeRoot('1.6.10-rc.29', '1.6.9');

    const result = syncPluginManifests(root, { check: true });

    expect(result.stale).toHaveLength(TOTAL_SURFACES);
    expect(result.synced).toHaveLength(0);
    expect(readVersions(root)).toEqual(Array(SURFACES.length).fill('1.6.9'));
  });

  it('changes only the version text and preserves the surrounding formatting', () => {
    const root = makeRoot('1.6.10-rc.29', '1.6.9');
    const inlineFormatted = `{
  "name": "axodex",
  "version": "1.6.9",
  "keywords": ["code-intelligence", "knowledge-graph", "mcp"]
}
`;
    writeFileSync(path.join(root, SURFACES[0]), inlineFormatted);

    syncPluginManifests(root);

    expect(readFileSync(path.join(root, SURFACES[0]), 'utf8')).toBe(
      inlineFormatted.replace('"version": "1.6.9"', '"version": "1.6.10-rc.29"'),
    );
  });

  it('fails closed when the current version text is ambiguous in the file', () => {
    const root = makeRoot('1.6.10-rc.29', '1.6.9');
    writeFileSync(
      path.join(root, SURFACES[0]),
      `{
  "name": "axodex",
  "version": "1.6.9",
  "previous": { "version": "1.6.9" }
}
`,
    );

    expect(() => syncPluginManifests(root)).toThrow(/expected exactly one/);
  });

  it('fails closed when a marketplace has no axodex entry', () => {
    const root = makeRoot('1.6.10-rc.29', '1.6.9');
    writeJson(root, SURFACES[1], { name: 'axodex-marketplace', plugins: [] });

    expect(() => syncPluginManifests(root)).toThrow(/exactly one "axodex" plugin entry/);
  });

  it('fails closed when a surface file is missing', () => {
    const root = makeRoot('1.6.10-rc.29', '1.6.9');
    rmSync(path.join(root, SURFACES[2]));

    expect(() => syncPluginManifests(root)).toThrow(/Cannot read manifest surface/);
  });

  it('fails closed on unparseable JSON', () => {
    const root = makeRoot('1.6.10-rc.29', '1.6.9');
    writeFileSync(path.join(root, SURFACES[0]), '{ not json');

    expect(() => syncPluginManifests(root)).toThrow(/not valid JSON/);
  });

  it('matches the real repository layout and passes the check on a synced tree', () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..');

    const result = syncPluginManifests(repoRoot, { check: true });

    expect(result.stale).toEqual([]);
  });

  it('is wired into the npm version lifecycle so every bump syncs the manifests', async () => {
    const pkg = await import('../../package.json', { with: { type: 'json' } });

    expect(pkg.default.scripts.version).toBe('node scripts/sync-plugin-manifests.mjs');
  });

  it('stages the synced manifest surfaces in the detached rc release commit', () => {
    const workflow = readFileSync(
      path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', 'publish.yml'),
      'utf8',
    );
    const start = workflow.indexOf('# The synced manifest surfaces (#2445)');
    const end = workflow.indexOf('git commit -m "release: ${VTAG}"', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const releaseCommit = workflow.slice(start, end);
    // The step runs in axodex/, so repo-root surfaces are staged as `../<path>`.
    const staged = [...releaseCommit.matchAll(/\.\.\/(\S+\.json)/g)].map(([, file]) => file);

    // `--check` reads the working tree, so a surface synced but not staged
    // passes CI while the v<version> tag's tree keeps the previous version.
    expect(staged).toEqual(expect.arrayContaining([...SURFACES, ...EXECUTABLE_MCP_FILES]));
  });
});
