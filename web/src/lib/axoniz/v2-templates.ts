/**
 * AXONIZ v2 — starter templates.
 *
 * 5 pre-built workflow templates that cover the most common automation
 * patterns. On init, these are written to ~/.fraziym/axoniz/templates/ if they
 * don't already exist. Users can then instantiate them via the UI or CLI.
 *
 * Templates are simple YAML files — same format as user-defined workflows.
 * No signing, no crypto. Just YAML.
 */
import fs from "node:fs";
import path from "node:path";
import { axonizHome } from "./paths";

const TEMPLATES_DIR = path.join(axonizHome(), "templates");

interface Template {
  filename: string;
  yaml: string;
}

const TEMPLATES: Template[] = [
  {
    filename: "auto-test-on-push.yml",
    yaml: `name: auto-test-on-push
description: Run tests automatically after every git commit
trigger:
  type: git_hook
  event: post_commit
steps:
  - id: run_tests
    tool: shell
    args:
      cmd: npm test
      timeoutSec: 120
  - id: log_result
    tool: log
    args:
      message: "Tests completed — exit code: {{run_tests.exitCode}}"
      level: info
onError:
  - tool: log
    args:
      message: "Tests FAILED — check the run for details"
      level: error
maxMinutes: 10
enabled: false
`,
  },
  {
    filename: "security-scan-pre-commit.yml",
    yaml: `name: security-scan-pre-commit
description: Scan for secrets and vulnerabilities before each commit
trigger:
  type: git_hook
  event: pre_push
steps:
  - id: scan
    tool: shell
    args:
      cmd: npx @fraziym/xorgis scan --path . --format json
      timeoutSec: 60
  - id: log_findings
    tool: log
    args:
      message: "Security scan complete — findings: {{scan.stdout}}"
      level: warn
maxMinutes: 5
enabled: false
`,
  },
  {
    filename: "daily-news-summary.yml",
    yaml: `name: daily-news-summary
description: Fetch a website every morning, summarize with AI, and email the result
trigger:
  type: schedule
  cron: "0 8 * * *"
steps:
  - id: fetch
    tool: http
    args:
      get: https://example.com/news
  - id: summarize
    tool: agent
    args:
      prompt: "Summarize the following content for a morning standup. Be concise and actionable.\\n\\n{{fetch.body}}"
      model: gemini-2.0-flash
  - id: send_email
    tool: log
    args:
      message: "Summary ready — configure email tool to send: {{summarize.result}}"
      level: info
secrets:
  - email_password
maxMinutes: 10
enabled: false
`,
  },
  {
    filename: "version-bump-on-commit.yml",
    yaml: `name: version-bump-on-commit
description: Detect forgotten version bumps and apply them automatically after commit
trigger:
  type: git_hook
  event: post_commit
steps:
  - id: classify_diff
    tool: shell
    args:
      cmd: git diff HEAD~1 --stat
      timeoutSec: 10
  - id: bump
    tool: shell
    args:
      cmd: npx @fraziym/axovb bump --diff "{{classify_diff.stdout}}"
      timeoutSec: 30
  - id: log_bump
    tool: log
    args:
      message: "Version bump result: {{bump.stdout}}"
      level: info
maxMinutes: 5
enabled: false
`,
  },
  {
    filename: "github-pr-digest.yml",
    yaml: `name: github-pr-digest
description: Fetch recent GitHub PRs, summarize with AI, and log the digest
trigger:
  type: schedule
  cron: "0 9 * * 1"
steps:
  - id: fetch_prs
    tool: http
    args:
      get: https://api.github.com/repos/{{secrets.github_repo}}/pulls?state=open
      headers:
        Authorization: "token {{secrets.github_pat}}"
        Accept: application/vnd.github.v3+json
  - id: summarize
    tool: agent
    args:
      prompt: "Summarize these open pull requests for a weekly digest. List title, author, and last update.\\n\\n{{fetch_prs.body}}"
      model: gemini-2.0-flash
  - id: log_digest
    tool: log
    args:
      message: "Weekly PR digest:\\n{{summarize.result}}"
      level: info
secrets:
  - github_pat
  - github_repo
maxMinutes: 10
enabled: false
`,
  },
];

/** Write templates to ~/.fraziym/axoniz/templates/ if they don't exist. */
export function initTemplates() {
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  for (const tpl of TEMPLATES) {
    const filePath = path.join(TEMPLATES_DIR, tpl.filename);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, tpl.yaml, "utf-8");
    }
  }
}

/** List all available templates (from ~/.fraziym/axoniz/templates/). */
export function listTemplates(): Array<{ filename: string; content: string }> {
  initTemplates();
  const result: Array<{ filename: string; content: string }> = [];
  for (const file of fs.readdirSync(TEMPLATES_DIR)) {
    if (!file.endsWith(".yml") && !file.endsWith(".yaml")) continue;
    try {
      const content = fs.readFileSync(path.join(TEMPLATES_DIR, file), "utf-8");
      result.push({ filename: file, content });
    } catch { /* skip */ }
  }
  return result;
}

/** Get a specific template by filename. */
export function getTemplate(filename: string): string | null {
  initTemplates();
  const filePath = path.join(TEMPLATES_DIR, filename);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf-8");
}
