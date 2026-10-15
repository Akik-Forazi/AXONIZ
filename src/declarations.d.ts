/**
 * Module declarations for optional dependencies that may not be installed
 * in all environments. These prevent TypeScript build errors (TS2307)
 * when a dependency is declared in package.json but not yet installed.
 *
 * On a clean checkout with `npm install`, the real type declarations
 * from the installed packages take precedence over these stubs.
 */

// CLI dependencies
declare module 'grammy';
declare module 'node-llama-cpp';
declare module '@huggingface/hub';
declare module 'undici';
declare module 'systeminformation';
declare module 'open';
declare module 'prom-client';
declare module 'js-yaml' {
  export function load(input: string, opts?: Record<string, unknown>): unknown;
  export function dump(obj: unknown, opts?: Record<string, unknown>): string;
  const _default: { load: typeof load; dump: typeof dump };
  export default _default;
}

// Web server dependencies (used by the legacy Express server, not Next.js)
declare module 'express' {
  import type { IncomingMessage, ServerResponse } from 'node:http';
  type Request = IncomingMessage & {
    body?: unknown;
    query?: Record<string, string>;
    params?: Record<string, string>;
    headers: Record<string, string>;
    ip?: string;
    file?: unknown;
  };
  type Response = ServerResponse & {
    status(code: number): Response;
    json(data: unknown): void;
    send(data: unknown): void;
    setHeader(name: string, value: string): void;
    writeHead(code: number, headers?: Record<string, string>): void;
    flushHeaders(): void;
  };
  type NextFunction = (err?: unknown) => void;
  interface Application {
    use(...handlers: Array<((req: Request, res: Response, next: NextFunction) => void) | string>): void;
    get(path: string, handler: (req: Request, res: Response, next: NextFunction) => void): void;
    post(path: string, handler: (req: Request, res: Response, next: NextFunction) => void): void;
    listen(port: number, cb?: () => void): void;
  }
  function express(): Application;
  namespace express {
    export type { Request, Response, NextFunction, Application };
  }
  export default express;
}
declare module 'multer' {
  export default function multer(opts?: Record<string, unknown>): (req: unknown, res: unknown, next: (err?: unknown) => void) => void;
}
