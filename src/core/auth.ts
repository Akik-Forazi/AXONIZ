/**
 * Zero-cost local authentication using JWT tokens. No external services required.
 * Port of axoniz/core/auth.py (PyJWT -> jose, hashlib.pbkdf2_hmac -> node:crypto).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SignJWT, jwtVerify } from "jose";

export const DEFAULT_SECRET_FILE = path.join(os.homedir(), ".axoniz", "secret.key");

interface StoredUser {
  password_hash: string;
  salt: string;
  created: string;
}

export class LocalAuth {
  readonly secretFile: string;
  private readonly secretKey: Uint8Array;

  constructor(secretFile?: string | null) {
    this.secretFile = secretFile ?? DEFAULT_SECRET_FILE;
    this.secretKey = new TextEncoder().encode(this.loadOrCreateSecret());
  }

  /** Load existing secret or create a new one. */
  private loadOrCreateSecret(): string {
    try {
      if (fs.existsSync(this.secretFile)) {
        return fs.readFileSync(this.secretFile, "utf-8").trim();
      }
    } catch {
      /* fall through to create */
    }

    const secret = crypto.randomBytes(32).toString("base64url");
    try {
      fs.mkdirSync(path.dirname(this.secretFile), { recursive: true });
      fs.writeFileSync(this.secretFile, secret, { encoding: "utf-8", mode: 0o600 });
    } catch {
      /* best-effort persistence, matching Python's try/except chmod */
    }
    return secret;
  }

  /** Create JWT token for a user. */
  async createToken(username: string, expiresHours = 24): Promise<string> {
    return new SignJWT({ username })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${expiresHours}h`)
      .sign(this.secretKey);
  }

  /** Verify JWT token and return username if valid, otherwise null. */
  async verifyToken(token: string): Promise<string | null> {
    try {
      const { payload } = await jwtVerify(token, this.secretKey, { algorithms: ["HS256"] });
      const username = payload.username;
      return typeof username === "string" ? username : null;
    } catch {
      // Covers both expired and invalid tokens, matching PyJWT's behaviour.
      return null;
    }
  }

  private get usersFile(): string {
    return path.join(path.dirname(this.secretFile), "users.json");
  }

  private readUsers(): Record<string, StoredUser> {
    try {
      if (!fs.existsSync(this.usersFile)) return {};
      return JSON.parse(fs.readFileSync(this.usersFile, "utf-8")) as Record<string, StoredUser>;
    } catch {
      return {};
    }
  }

  private static hashPassword(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex");
  }

  /** Create a user with a hashed password (stored locally). */
  createUser(username: string, password: string): void {
    const users = this.readUsers();
    const salt = crypto.randomBytes(16).toString("hex");
    users[username] = {
      password_hash: LocalAuth.hashPassword(password, salt),
      salt,
      created: new Date().toISOString(),
    };
    fs.mkdirSync(path.dirname(this.usersFile), { recursive: true });
    fs.writeFileSync(this.usersFile, JSON.stringify(users, null, 2), {
      encoding: "utf-8",
      mode: 0o600,
    });
  }

  /** Verify a user's password using a constant-time comparison. */
  verifyPassword(username: string, password: string): boolean {
    const users = this.readUsers();
    const user = users[username];
    if (!user) return false;

    const computed = LocalAuth.hashPassword(password, user.salt);
    const a = Buffer.from(computed, "hex");
    const b = Buffer.from(user.password_hash, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  /** True when at least one local user exists. */
  hasUsers(): boolean {
    return Object.keys(this.readUsers()).length > 0;
  }
}

let authInstance: LocalAuth | null = null;

export function getAuth(secretFile?: string | null): LocalAuth {
  if (authInstance === null) authInstance = new LocalAuth(secretFile);
  return authInstance;
}
