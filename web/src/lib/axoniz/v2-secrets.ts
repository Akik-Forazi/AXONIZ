/**
 * AXONIZ v2 — secret management.
 *
 * Simple JSON file at ~/.fraziym/axoniz/secrets.json. Plaintext (no encryption —
 * the user said no over-engineering). Mode 0600 (owner read/write only).
 *
 * Workflows reference secrets via {{secrets.foo}} — resolved at runtime
 * by the workflow runner.
 *
 * API:
 *   loadSecrets()              → Record<string, string>
 *   saveSecrets(secrets)       → void
 *   getSecret(key)             → string | undefined
 *   setSecret(key, value)      → void
 *   deleteSecret(key)          → void
 */
import fs from "node:fs";
import path from "node:path";
import { axonizHome } from "./paths";

const SECRETS_PATH = path.join(axonizHome(), "secrets.json");

export function loadSecrets(): Record<string, string> {
  try {
    if (fs.existsSync(SECRETS_PATH)) {
      return JSON.parse(fs.readFileSync(SECRETS_PATH, "utf-8")) as Record<string, string>;
    }
  } catch { /* corrupt — start fresh */ }
  return {};
}

export function saveSecrets(secrets: Record<string, string>): void {
  const dir = path.dirname(SECRETS_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SECRETS_PATH, JSON.stringify(secrets, null, 2), { mode: 0o600 });
}

export function getSecret(key: string): string | undefined {
  return loadSecrets()[key];
}

export function setSecret(key: string, value: string): void {
  const all = loadSecrets();
  all[key] = value;
  saveSecrets(all);
}

export function deleteSecret(key: string): void {
  const all = loadSecrets();
  delete all[key];
  saveSecrets(all);
}
