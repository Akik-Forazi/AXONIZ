/**
 * AXONIZ version — single authoritative source.
 *
 * Uses the FRAZIYM versioning format (NOT conventional semver):
 *
 *   VPP.FF.BBB-STAGE-RR
 *   │  │  │    │     │
 *   │  │  │    │     └── Pre-release revision (01, 02, …)
 *   │  │  │    └──────── Release stage (-alpha | -beta | -rc; omitted when stable)
 *   │  │  └───────────── Bug-fix version (000, 001, …)
 *   │  └──────────────── Feature version (00, 01, …)
 *   └─────────────────── Platform generation (V00, V01, …)
 *
 * Current version: V00.01.003-beta-04
 *   - V00   = first platform generation under FRAZIYM versioning
 *   - 01    = first feature version (the rebuilt TS port + Next.js dashboard
 *             + standalone axodex extraction era)
 *   - 000   = no bug fixes yet
 *   - -beta = beta release stage
 *   - 01    = first beta revision
 *
 * Sync points that carry this string (verified by tests/version.test.ts):
 *   - src/version.ts                 (this file — the source of truth)
 *   - package.json                   (the "version" field, semver-translated)
 *   - src/core/runner.ts             (the CLI banner displays)
 *   - README.md                      (the install instructions)
 *   - tests/version.test.ts          (the test that verifies all sync points)
 *
 * The package.json version is a semver-compatible translation of this
 * string because npm requires valid semver. Mapping:
 *
 *   V00.01.000-beta-01  →  0.1.3-beta.4
 *   V00 → major 0
 *   01  → minor 1
 *   000 → patch 0
 *   -beta → -beta
 *   01  → .1
 *
 * Bump procedure:
 *   1. Edit this file — bump AXONIZ_VERSION
 *   2. Translate to semver and update package.json "version"
 *   3. Update README.md displayed version
 *   4. Run `npm test` — version.test.ts fails if any sync point is stale
 *   5. Commit + push + `npm publish`
 *
 * The CLI banner in src/core/runner.ts also uses AXONIZ_VERSION directly
 * (imported here) so the displayed version is always this string, not
 * the semver translation.
 */

export const AXONIZ_VERSION = "V00.01.000-beta-01";

/**
 * The release stage of the current version. Useful for runtime branching
 * (e.g. show a "beta" warning banner in the web UI).
 */
export const AXONIZ_RELEASE_STAGE: "alpha" | "beta" | "rc" | "stable" = "beta";

/**
 * Semver-compatible translation of AXONIZ_VERSION. This is what
 * package.json "version" should match. The tests/version.test.ts
 * verifies they stay in sync.
 */
export const AXONIZ_VERSION_SEMVER = "0.1.0-beta.1";

/**
 * Parse a FRAZIYM version string into its components. Returns null if
 * the format doesn't match. Used by the test to verify the format is
 * well-formed.
 */
export function parseFraziymVersion(v: string): {
  platform: number;
  feature: number;
  bugfix: number;
  stage: "alpha" | "beta" | "rc" | "stable";
  revision: number | null;
} | null {
  const m = v.match(/^V(\d{2})\.(\d{2})\.(\d{3})(?:-(alpha|beta|rc)(?:-(\d{2}))?)?$/);
  if (!m) return null;
  return {
    platform: Number(m[1]),
    feature: Number(m[2]),
    bugfix: Number(m[3]),
    stage: (m[4] as "alpha" | "beta" | "rc" | undefined) ?? "stable",
    revision: m[5] ? Number(m[5]) : null,
  };
}

/**
 * Translate a FRAZIYM version string to its semver equivalent. Returns
 * null if the input isn't a valid FRAZIYM version.
 */
export function fraziymToSemver(v: string): string | null {
  const p = parseFraziymVersion(v);
  if (!p) return null;
  let semver = `${p.platform}.${p.feature}.${p.bugfix}`;
  if (p.stage !== "stable") {
    semver += `-${p.stage}`;
    if (p.revision !== null) semver += `.${p.revision}`;
  }
  return semver;
}
