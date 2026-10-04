# Security Policy

## Supported Versions

Axodex is developed on `main`. Security fixes are applied to the latest released minor on npm (`axodex`) and to the published Docker images (`Dockerfile.cli`, `Dockerfile.web`). Older minors are not back-patched.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security reports.**

Use **GitHub Private Vulnerability Reporting** for this repository:

→ https://github.com/abhigyanpatwari/Axodex/security/advisories/new

Please include:

- A description of the issue and its potential impact
- Steps to reproduce (a minimal repro repo or commit hash if possible)
- The affected version(s) — `npm view axodex version`, image digest, or commit SHA
- Any suggested mitigation

### What to expect

- **Acknowledgement:** best-effort within 5 business days, subject to maintainer capacity.
- **Triage:** we will confirm whether the report is in scope, request clarifications if needed, and propose a fix timeline.
- **Disclosure:** coordinated. We will agree on a disclosure date with you before publishing an advisory.

### Scope

In scope:

- The `axodex` CLI and MCP server (`axodex/`)
- The `axodex-web` thin client (`axodex-web/`)
- The `axodex-shared` types package (`axodex-shared/`)
- The published Docker images (`Dockerfile.cli`, `Dockerfile.web`)
- GitHub Actions workflows in `.github/workflows/`

Out of scope:

- Vulnerabilities in third-party dependencies that we have no influence over (please report upstream; if a viable mitigation exists at the Axodex layer, that's in scope).
- Issues requiring physical access to a developer machine or a compromised local environment.
- Theoretical attacks without a practical exploit against a default Axodex deployment.

## Recommended Hardening for Forks and Self-Hosted Deployments

If you fork Axodex or self-host it, we recommend enabling the following in your repository's **Settings → Code security and analysis**:

- **Private vulnerability reporting** — the channel described above.
- **Dependabot alerts** — alerts on advisories affecting your dependencies.
- **Dependabot security updates** — automated PRs for security patches (this repo's `.github/dependabot.yml` already covers version updates).
- **Secret scanning** and **Push protection** — blocks pushes that introduce known secret patterns. Defense-in-depth on top of the in-CI Gitleaks scan documented below.
- **Code scanning** — surfaces SARIF results from CodeQL, Trivy, Scorecard, and zizmor in one place.

### Hosted Deploys on Render

The `render.yaml` Blueprint (see the README's **Deploy to Render**) puts `axodex serve` on a **private service** with no public URL, and a public web service in front of it that reverse-proxies `/api/*`. What that does and does not protect:

- **The web service is public and its URL is discoverable.** `onrender.com` hostnames appear in certificate transparency logs. Treat the URL as known rather than secret.
- **The generated `AXODEX_SERVE_AUTH_TOKEN` is the only access control.** The proxy rejects any `/api/*` request without it with a `401` before forwarding. Rotate it by editing the environment variable on the `axodex-web` service and redeploying.
- **The CSRF guard is inert on this path.** The proxy strips `Origin` before forwarding, so the server's write-origin guard does nothing for proxied traffic — it passes `Origin`-less requests through by design. The token is not a second layer behind the guard.
- **Anyone holding the token can read every indexed repo's source.** These routes carry no origin guard, and the first three carry no rate limiter either: `GET /api/repos`, `GET /api/graph`, `POST /api/query`, `GET /api/file`, `GET /api/grep`. Whoever has the token can also index and delete repositories.
- **`POST /api/mcp` rides the same path.** When `AXODEX_MCP_AUTH_TOKEN` is set on the backend, `serve` protects `/api/mcp` with the same constant-time Bearer check as the dedicated HTTP MCP server, before parsing the request body. The Render Blueprint does not set a backend MCP token by default. To enable it behind the proxy, set the **same** `AXODEX_MCP_AUTH_TOKEN` on both the `axodex-web` proxy and the `axodex-server` backend: the proxy consumes the edge `AXODEX_SERVE_AUTH_TOKEN`, then replaces `Authorization` with the MCP token on `/api/mcp` (and its subpaths) only — the edge credential is never forwarded, and other `/api/*` routes stay stripped. Configuring it on the backend alone makes every proxied MCP request `401`.
- **A directly reachable `serve` still needs an explicit control.** If neither `AXODEX_MCP_AUTH_TOKEN` nor an authenticated edge/private-network boundary is present, `/api/mcp` is unauthenticated. Do not bind that topology to a LAN or public interface: MCP readers can access indexed source and graph context.
- **Rate limits bound cost, not access.** They cap what a token holder can spend; they do not decide who gets in.

Do not hand the URL out as a public demo. A token holder has read access to everything the deploy has indexed.

### `/api/grep` regex semantics and residual ReDoS exposure

`GET /api/grep` executes caller-supplied patterns as real regular expressions (with an optional path-substring `fileFilter` and `caseSensitive` flag) to honor the web chat's grep tool contract; `literal=1` restores the older escaped-substring mode. Mitigations: a 200-character pattern cap, line-by-line matching, a max-200 result cap, and a 5-second wall-clock budget. Matching runs in a `worker_threads` worker so a catastrophic pattern (e.g. `(a+)+$`) can be killed with `terminate()` when the budget expires — the parent event loop (other routes + SSE) stays responsive. A timed-out scan returns partial results with `timedOut: true`; the web grep tool surfaces that flag so an agent does not treat a cut-off scan as exhaustive. CodeQL still flags constructing a `RegExp` from the query string; that is the advertised contract, not accidental injection. Hosted deploys continue to gate the route behind the edge token.

## Automated Scans Running in CI

This repository runs the following scans automatically. Findings appear under the repository's **Security → Code scanning** tab.

| Scan | Tool | Trigger | Action on finding |
|------|------|---------|-------------------|
| Static analysis (JS/TS, Python) | [CodeQL](https://github.com/github/codeql-action) | PR, `main` push, weekly | Advisory (Security tab) |
| Dependency vulnerabilities (PR diff) | [`dependency-review-action`](https://github.com/actions/dependency-review-action) | PR | **Blocks PR** at `high+` severity |
| Secret scanning | [Gitleaks](https://github.com/gitleaks/gitleaks-action) | PR, `main` push | **Blocks PR** on default rules |
| Supply-chain posture | [OpenSSF Scorecard](https://github.com/ossf/scorecard-action) | Weekly, `main` push | Advisory (Security tab + public badge) |
| Workflow lint | [zizmor](https://github.com/woodruffw/zizmor) | PR (touching `.github/**`) | **Blocks PR** at `high+` severity |
| Container image scan | [Trivy](https://github.com/aquasecurity/trivy-action) | Weekly, `main` push | Advisory (Security tab) |

Dependency version updates are managed separately by Dependabot — see `.github/dependabot.yml`.
