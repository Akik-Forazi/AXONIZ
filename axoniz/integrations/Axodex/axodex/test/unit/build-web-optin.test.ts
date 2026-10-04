import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { load } from 'js-yaml';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runWebBuild, shouldBuildWeb, shouldPreserveWebOutput } from '../../scripts/build-web.js';

/** Default prepare/build stay CLI-only; the web UI ships only via prepack --web. */
const REPO_ROOT = path.resolve(__dirname, '../../..');
const CLI_TSC_JS = 'node ../axodex/node_modules/typescript/lib/tsc.js';
const WEB_TSC_JS = 'node ../axodex-web/node_modules/typescript/lib/tsc.js';
const PACKAGE_JSON = JSON.parse(
  readFileSync(path.join(REPO_ROOT, 'axodex/package.json'), 'utf8'),
) as { scripts?: Record<string, string> };
const tempDirs: string[] = [];

interface WorkflowStep {
  name?: string;
  run?: unknown;
  uses?: string;
  with?: Record<string, unknown>;
  env?: Record<string, unknown>;
  if?: string;
  'working-directory'?: string;
}

interface WorkflowJob {
  'timeout-minutes'?: number;
  steps?: WorkflowStep[];
}

function jobs(workflowPath: string): Record<string, WorkflowJob> {
  const doc = load(readFileSync(path.join(REPO_ROOT, workflowPath), 'utf8')) as {
    jobs?: Record<string, WorkflowJob>;
  };
  return doc.jobs ?? {};
}

function compositeAction(actionPath: string): {
  inputs?: Record<string, { default?: string }>;
  runs?: { steps?: WorkflowStep[] };
} {
  return load(readFileSync(path.join(REPO_ROOT, actionPath), 'utf8')) as {
    inputs?: Record<string, { default?: string }>;
    runs?: { steps?: WorkflowStep[] };
  };
}

const ciJobs = jobs('.github/workflows/ci-tests.yml');
const publishJobs = jobs('.github/workflows/publish.yml');
const qualityJobs = jobs('.github/workflows/ci-quality.yml');
const setupAxodex = compositeAction('.github/actions/setup-axodex/action.yml');
const setupAxodexWeb = compositeAction('.github/actions/setup-axodex-web/action.yml');

function stepIndex(steps: WorkflowStep[], predicate: (step: WorkflowStep) => boolean): number {
  return steps.findIndex(predicate);
}

const installsWeb = (step: WorkflowStep) =>
  step['working-directory'] === 'axodex-web' && String(step.run ?? '').includes('npm ci');

function runWeb(
  fixture: ReturnType<typeof buildFixture>,
  overrides: {
    timeoutMs?: number;
    argv?: string[];
    env?: NodeJS.Dict<string>;
    exec?: (...args: unknown[]) => unknown;
  } = {},
) {
  return runWebBuild({
    root: fixture.root,
    dist: fixture.dist,
    timeoutMs: 600_000,
    argv: ['node', 'build.js'],
    env: {},
    exec: vi.fn(),
    ...overrides,
  });
}

function buildFixture({ withWeb = true, withNodeModules = true } = {}) {
  const workspace = mkdtempSync(path.join(os.tmpdir(), 'axodex-build-web-'));
  tempDirs.push(workspace);

  const root = path.join(workspace, 'axodex');
  const dist = path.join(root, 'dist');
  const webRoot = path.join(workspace, 'axodex-web');
  mkdirSync(dist, { recursive: true });

  if (withWeb) {
    mkdirSync(path.join(webRoot, 'dist', 'assets'), { recursive: true });
    writeFileSync(path.join(webRoot, 'package.json'), '{}');
    writeFileSync(
      path.join(webRoot, 'dist', 'index.html'),
      '<script src="/assets/app.js"></script>',
    );
    writeFileSync(path.join(webRoot, 'dist', 'assets', 'app.js'), 'export {};');
    if (withNodeModules) mkdirSync(path.join(webRoot, 'node_modules'));
  }

  return { root, dist, webRoot, webDest: path.join(root, 'web') };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('axodex build scripts', () => {
  it('keeps the default build CLI-only', () => {
    expect(PACKAGE_JSON.scripts?.build).toBe('node scripts/build.js');
    expect(PACKAGE_JSON.scripts?.prepare).toBe('node scripts/build.js');
    expect(PACKAGE_JSON.scripts?.prepare).not.toContain('--web');
  });

  it('compiles axodex-shared with axodex TypeScript, not a separate TypeScript 7 install', () => {
    const src = readFileSync(path.join(REPO_ROOT, 'axodex/scripts/build.js'), 'utf8');
    expect(src).toContain("path.join(ROOT, 'node_modules', 'typescript', 'lib', 'tsc.js')");
    expect(src).toContain('execFileSync(process.execPath, [tscJs]');
    expect(src).not.toMatch(/node_modules['"]?, ['"]\.bin/);
    expect(src).not.toMatch(/execFileSync\([^)]*tsc\.cmd/);
    expect(src).not.toContain("typescript', 'bin', 'tsc'");
  });

  it.skipIf(!existsSync(path.join(REPO_ROOT, 'axodex/node_modules/typescript/lib/tsc.js')))(
    'can launch TypeScript via node + lib/tsc.js on this OS',
    () => {
      const probe = spawnSync(
        process.execPath,
        [path.join(REPO_ROOT, 'axodex/node_modules/typescript/lib/tsc.js'), '--version'],
        { encoding: 'utf8' },
      );
      expect(probe.status).toBe(0);
      expect(probe.stdout).toMatch(/Version \d+/);
    },
  );

  it('builds the web UI from prepack, which is what ships the tarball', () => {
    expect(PACKAGE_JSON.scripts?.prepack).toContain('scripts/build.js --web');
    expect(PACKAGE_JSON.scripts?.prepack).toContain('scripts/assert-web-assets.mjs web');
    expect(PACKAGE_JSON.scripts?.['build:web']).toBe('node scripts/build.js --web');
  });

  it('recognizes only explicit CLI or environment opt-ins', () => {
    expect(shouldBuildWeb(['node', 'build.js'], {})).toBe(false);
    expect(shouldBuildWeb(['node', 'build.js', '--web'], {})).toBe(true);
    expect(shouldBuildWeb(['node', 'build.js'], { AXODEX_BUILD_WEB: '1' })).toBe(true);
    expect(shouldBuildWeb(['node', 'build.js'], { AXODEX_BUILD_WEB: 'true' })).toBe(false);
  });

  it('removes stale packaged output from a default build', () => {
    const fixture = buildFixture();
    mkdirSync(fixture.webDest, { recursive: true });
    writeFileSync(path.join(fixture.webDest, 'index.html'), 'stale');

    const exec = vi.fn();
    const result = runWeb(fixture, { exec });

    expect(result.status).toBe('skipped');
    expect(exec).not.toHaveBeenCalled();
    expect(existsSync(fixture.webDest)).toBe(false);
  });

  it('preserves prepack output during npm prepare for pack and publish', () => {
    for (const npmCommand of ['pack', 'publish']) {
      const fixture = buildFixture();
      mkdirSync(fixture.webDest, { recursive: true });
      writeFileSync(path.join(fixture.webDest, 'index.html'), npmCommand);

      expect(
        shouldPreserveWebOutput({
          npm_lifecycle_event: 'prepare',
          npm_command: npmCommand,
        }),
      ).toBe(true);
      runWeb(fixture, {
        env: { npm_lifecycle_event: 'prepare', npm_command: npmCommand },
      });

      expect(readFileSync(path.join(fixture.webDest, 'index.html'), 'utf8')).toBe(npmCommand);
    }
  });

  it('fails closed when an explicit web build has no web package', () => {
    const fixture = buildFixture({ withWeb: false });
    expect(() => runWeb(fixture, { argv: ['node', 'build.js', '--web'] })).toThrow(
      'web UI requested, but axodex-web was not found',
    );
  });

  it('builds and copies the web UI with an untimed fallback install', () => {
    const fixture = buildFixture({ withNodeModules: false });
    const exec = vi.fn();
    const result = runWeb(fixture, {
      timeoutMs: 123_456,
      argv: ['node', 'build.js', '--web'],
      exec,
    });

    expect(exec).toHaveBeenNthCalledWith(1, 'npm ci', {
      cwd: fixture.webRoot,
      stdio: 'inherit',
    });
    expect(exec).toHaveBeenNthCalledWith(2, 'npm run build', {
      cwd: fixture.webRoot,
      stdio: 'inherit',
      timeout: 123_456,
    });
    expect(result.status).toBe('built');
    expect(readFileSync(path.join(fixture.webDest, 'index.html'), 'utf8')).toContain('app.js');
  });

  it('rejects a packaged web UI with missing referenced assets', () => {
    const fixture = buildFixture();
    const checker = path.join(REPO_ROOT, 'axodex/scripts/assert-web-assets.mjs');

    expect(spawnSync(process.execPath, [checker, path.join(fixture.webRoot, 'dist')]).status).toBe(
      0,
    );
    rmSync(path.join(fixture.webRoot, 'dist', 'assets', 'app.js'));

    const invalid = spawnSync(process.execPath, [checker, path.join(fixture.webRoot, 'dist')], {
      encoding: 'utf8',
    });
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain('references missing assets');

    const missingIndex = spawnSync(
      process.execPath,
      [checker, path.join(fixture.webRoot, 'none')],
      {
        encoding: 'utf8',
      },
    );
    expect(missingIndex.status).toBe(1);
    expect(missingIndex.stderr).toContain('missing');
  });
});

describe('workflows that need the web UI install it themselves', () => {
  it('packaged install smoke installs axodex-web before npm pack', () => {
    const steps = ciJobs['packaged-install-smoke']?.steps ?? [];
    const webIdx = stepIndex(steps, installsWeb);
    const packIdx = stepIndex(steps, (step) => String(step.run ?? '').includes('npm pack'));
    expect(webIdx).toBeGreaterThanOrEqual(0);
    expect(packIdx).toBeGreaterThan(webIdx);
  });

  it('packaged install smoke validates web assets in the installed tarball', () => {
    const steps = ciJobs['packaged-install-smoke']?.steps ?? [];
    const artifactCheck = steps.find((step) =>
      String(step.run ?? '').includes('scripts/assert-web-assets.mjs'),
    );
    expect(artifactCheck).toBeTruthy();
    expect(String(artifactCheck?.run)).toContain('$INSTALLED/web');
  });

  it('publish installs axodex-web before it packs the tarball', () => {
    const steps = publishJobs['publish']?.steps ?? [];
    const webIdx = stepIndex(steps, installsWeb);
    const publishIdx = stepIndex(steps, (step) =>
      String(step.run ?? '').includes('npm publish --dry-run'),
    );
    expect(webIdx).toBeGreaterThanOrEqual(0);
    expect(publishIdx).toBeGreaterThan(webIdx);
  });

  it('node floor compat stays CLI-only — it never installs the web tree', () => {
    const steps = ciJobs['node-floor-compat']?.steps ?? [];
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.filter(installsWeb)).toHaveLength(0);
  });

  it('packaged install smoke skips a pre-pack CLI build and keeps a 20-minute budget', () => {
    const job = ciJobs['packaged-install-smoke'];
    const setup = job?.steps?.find((step) => step.uses === './.github/actions/setup-axodex');
    expect(job?.['timeout-minutes']).toBe(20);
    expect(setup?.with?.['lifecycle-scripts']).toBe('false');
    expect(setup?.with?.build).toBeUndefined();
  });
});

describe('setup-axodex job budget', () => {
  it('does not npm-ci axodex-shared (TypeScript 7 optional-platform install stalls CI)', () => {
    const shared = setupAxodex.runs?.steps?.find((step) => step.name === 'Build axodex-shared');
    expect(String(shared?.run)).toBe(CLI_TSC_JS);
    expect(String(shared?.run)).not.toContain('.bin');
    expect(shared?.if).toContain("lifecycle-scripts == 'false'");
    expect(
      setupAxodex.runs?.steps?.some(
        (step) =>
          step['working-directory'] === 'axodex-shared' &&
          String(step.run ?? '').includes('npm ci'),
      ),
    ).toBe(false);
    expect(setupAxodex.inputs?.['lifecycle-scripts']?.default).toBe('true');
    expect(
      setupAxodex.runs?.steps?.some((step) =>
        String(step.run ?? '').includes('--ignore-scripts'),
      ),
    ).toBe(true);
  });

  it('setup-axodex-web compiles shared with the web TypeScript and skips Playwright browsers', () => {
    const setupNode = setupAxodexWeb.runs?.steps?.find((step) =>
      String(step.uses ?? '').startsWith('actions/setup-node@'),
    );
    const shared = setupAxodexWeb.runs?.steps?.find(
      (step) => step.name === 'Build axodex-shared',
    );
    const webInstall = setupAxodexWeb.runs?.steps?.find(
      (step) => step.name === 'Install web dependencies',
    );
    expect(String(setupNode?.with?.['cache-dependency-path'])).toBe(
      'axodex-web/package-lock.json',
    );
    expect(String(shared?.run)).toBe(WEB_TSC_JS);
    expect(String(shared?.run)).not.toContain('.bin');
    expect(String(shared?.run)).not.toContain('npm ci');
    expect(webInstall?.env?.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD).toBe('1');
  });

  it('Vercel installs web first and compiles shared with the web TypeScript', () => {
    const vercel = JSON.parse(
      readFileSync(path.join(REPO_ROOT, 'axodex-web/vercel.json'), 'utf8'),
    ) as { installCommand?: string };
    const install = String(vercel.installCommand);
    // Vercel runs installCommand with NODE_ENV=production, so npm ci drops
    // typescript unless --include=dev is on that install (not a later step).
    expect(install).toContain('npm ci --include=dev');
    expect(install).toContain('axodex-shared');
    expect(install.indexOf('npm ci --include=dev')).toBeLessThan(
      install.indexOf('axodex-shared'),
    );
    expect(install).toContain(WEB_TSC_JS);
    expect(install).not.toMatch(/axodex-shared[^&]*npm (?:ci|install)/);
  });

  it('quality typecheck skips prepare/postinstall so tsc --noEmit fits in 10 minutes', () => {
    const job = qualityJobs.typecheck;
    const setup = job?.steps?.find((step) => step.uses === './.github/actions/setup-axodex');
    expect(job?.['timeout-minutes']).toBe(10);
    expect(setup?.with?.['lifecycle-scripts']).toBe('false');
  });

  it('web app tsconfig typechecks React JSX on TypeScript 7 without baseUrl', () => {
    const tsconfig = JSON.parse(
      readFileSync(path.join(REPO_ROOT, 'axodex-web/tsconfig.app.json'), 'utf8'),
    ) as {
      compilerOptions?: {
        baseUrl?: string;
        jsx?: string;
        jsxImportSource?: string;
        lib?: string[];
        rootDir?: string;
        types?: string[];
      };
    };
    const options = tsconfig.compilerOptions ?? {};
    expect(options.baseUrl).toBeUndefined();
    expect(options.jsx).toBe('react-jsx');
    expect(options.jsxImportSource).toBe('react');
    expect(options.lib).toEqual(expect.arrayContaining(['ESNext', 'DOM', 'DOM.Iterable']));
    expect(options.rootDir).toBe('./src');
    expect(options.types).toEqual(['vite/client']);
  });

  it('quality typecheck-web can finish a cold web install instead of canceling before cache save', () => {
    expect(qualityJobs['typecheck-web']?.['timeout-minutes']).toBe(15);
  });

  it('quality format matches lint budget and skips husky during npm ci', () => {
    const formatCi = qualityJobs.format?.steps?.find((step) =>
      String(step.run ?? '').includes('npm ci'),
    );
    const lintCi = qualityJobs.lint?.steps?.find((step) =>
      String(step.run ?? '').includes('npm ci'),
    );
    expect(qualityJobs.format?.['timeout-minutes']).toBe(10);
    expect(qualityJobs.lint?.['timeout-minutes']).toBe(10);
    expect(String(formatCi?.run)).toContain('--ignore-scripts');
    expect(String(lintCi?.run)).toContain('--ignore-scripts');
  });
});
