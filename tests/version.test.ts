/**
 * AXONIZ version sync verification.
 *
 * Verifies that AXONIZ_VERSION (the single source of truth in
 * src/version.ts) matches across all sync points:
 *
 *   1. src/version.ts              ← the source of truth (AXONIZ_VERSION)
 *   2. package.json                ← the semver-translated "version" field
 *   3. src/core/runner.ts           ← CLI banner displays (AXONIZ_VERSION imported + used)
 *   4. README.md                    ← displayed version at the top
 *   5. tests/version.test.ts        ← this test file (itself a sync point)
 *
 * Also verifies:
 *   - AXONIZ_VERSION matches the FRAZIYM format regex
 *   - AXONIZ_VERSION_SEMVER == fraziymToSemver(AXONIZ_VERSION)
 *   - package.json "version" matches AXONIZ_VERSION_SEMVER
 *   - src/core/runner.ts imports AXONIZ_VERSION (so the banner uses it)
 *
 * If this test fails, one of the sync points is stale. Fix by:
 *   1. Edit src/version.ts (the source of truth)
 *   2. Re-derive the semver translation and update package.json "version"
 *   3. Update README.md displayed version
 *   4. Re-run this test
 *
 * Run with: `npm test` (or `npx vitest run tests/version.test.ts`)
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AXONIZ_VERSION,
  AXONIZ_VERSION_SEMVER,
  AXONIZ_RELEASE_STAGE,
  parseFraziymVersion,
  fraziymToSemver,
} from "../src/version.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");

function readJson(p: string): Record<string, unknown> {
  const text = fs.readFileSync(p, "utf-8");
  return JSON.parse(text) as Record<string, unknown>;
}

function readText(p: string): string {
  return fs.readFileSync(p, "utf-8");
}

describe("AXONIZ_VERSION format", () => {
  it("matches the FRAZIYM version regex", () => {
    expect(parseFraziymVersion(AXONIZ_VERSION)).not.toBeNull();
  });

  it("is currently in beta stage", () => {
    const parsed = parseFraziymVersion(AXONIZ_VERSION);
    expect(parsed?.stage).toBe("beta");
    expect(AXONIZ_RELEASE_STAGE).toBe("beta");
  });

  it("has a pre-release revision (since it's beta)", () => {
    const parsed = parseFraziymVersion(AXONIZ_VERSION);
    expect(parsed?.revision).not.toBeNull();
    expect(parsed?.revision).toBeGreaterThan(0);
  });
});

describe("AXONIZ_VERSION_SEMVER translation", () => {
  it("matches fraziymToSemver(AXONIZ_VERSION)", () => {
    expect(AXONIZ_VERSION_SEMVER).toBe(fraziymToSemver(AXONIZ_VERSION));
  });

  it("is valid semver (parseable by npm)", () => {
    // Simple semver regex — npm uses a stricter one but this catches the
    // obvious cases (V-prefix, triple-digit minor, etc.)
    const semverRe = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
    expect(AXONIZ_VERSION_SEMVER).toMatch(semverRe);
  });
});

describe("Sync point: package.json", () => {
  it('"version" field matches AXONIZ_VERSION_SEMVER', () => {
    const pkg = readJson(path.join(REPO_ROOT, "package.json"));
    expect(pkg.version).toBe(AXONIZ_VERSION_SEMVER);
  });

  it('"name" is @fraziym/axoniz', () => {
    const pkg = readJson(path.join(REPO_ROOT, "package.json"));
    expect(pkg.name).toBe("@fraziym/axoniz");
  });

  it('declares @fraziym/axodex as a peerDependency (matched to AXONIZ_VERSION_SEMVER)', () => {
    const pkg = readJson(path.join(REPO_ROOT, "package.json"));
    const peers = pkg.peerDependencies as Record<string, string> | undefined;
    expect(peers).toBeDefined();
    expect(peers?.["@fraziym/axodex"]).toContain(AXONIZ_VERSION_SEMVER.split("-")[0]);
  });
});

describe("Sync point: src/core/runner.ts", () => {
  it("imports AXONIZ_VERSION from src/version.ts (so the CLI banner uses it)", () => {
    const runner = readText(path.join(REPO_ROOT, "src", "core", "runner.ts"));
    expect(runner).toContain('import { AXONIZ_VERSION } from "../version.js"');
    // Banner displays must reference AXONIZ_VERSION (not the raw VERSION)
    expect(runner).toContain("${AXONIZ_VERSION}");
  });
});

describe("Sync point: README.md", () => {
  it("mentions AXONIZ_VERSION somewhere (displayed to users)", () => {
    const readme = readText(path.join(REPO_ROOT, "README.md"));
    expect(readme).toContain(AXONIZ_VERSION);
  });
});

describe("Sync point: this test file", () => {
  // The test itself is a sync point — by importing AXONIZ_VERSION and
  // asserting on it, we ensure the test fails if version.ts is edited
  // without updating the expected values above.
  it("imports AXONIZ_VERSION successfully", () => {
    expect(typeof AXONIZ_VERSION).toBe("string");
    expect(AXONIZ_VERSION.length).toBeGreaterThan(0);
  });
});
