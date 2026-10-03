/**
 * Axoniz-Zero Model Downloader
 * Fetches GGUF models from HuggingFace directly.
 * Port of axoniz/core/downloader.py (huggingface_hub -> @huggingface/hub + undici).
 *
 * Downloads are streamed to disk with HTTP Range resume so multi-GB GGUFs
 * survive a dropped connection. `@huggingface/hub`'s listModels/listFiles are
 * used for discovery.
 */
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { listFiles, listModels } from "@huggingface/hub";
import { request } from "undici";
import { MODELS_DIR } from "./config.js";
import { debug, error, info } from "./debug.js";

/** Track download progress: filename -> percent (0-100, or -1 on failure). */
const downloads = new Map<string, number>();

export interface RemoteModel {
  id: string;
  author: string | null;
  lastModified: string | null;
  downloads: number | null;
  likes: number | null;
}

/** Search HuggingFace for GGUF models. */
export async function searchModels(query = "gguf", limit = 10): Promise<RemoteModel[]> {
  try {
    const results: RemoteModel[] = [];
    for await (const m of listModels({ search: { query }, limit })) {
      const model = m as unknown as Record<string, unknown>;
      const id = String(model.name ?? model.id ?? "");
      results.push({
        id,
        author: id.includes("/") ? id.split("/")[0] : null,
        lastModified: (model.updatedAt as string | undefined) ?? null,
        downloads: (model.downloads as number | undefined) ?? null,
        likes: (model.likes as number | undefined) ?? null,
      });
    }
    return results;
  } catch (e) {
    error(`[Downloader] search failed: ${errMsg(e)}`);
    return [];
  }
}

/** List available GGUF files in a repo. */
export async function listRemoteGgufs(repoId: string): Promise<string[]> {
  try {
    const files: string[] = [];
    for await (const f of listFiles({ repo: repoId })) {
      const p = (f as { path?: string }).path ?? "";
      if (p.endsWith(".gguf")) files.push(p);
    }
    return files;
  } catch {
    return [];
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Stream a URL to `dest`, resuming a partial file via HTTP Range requests.
 * Returns the resolved destination path.
 *
 * Correctness notes (each of these bites in practice):
 *  - 416 means the local file is already complete.
 *  - A server that ignores Range answers 200 with the FULL body; appending then
 *    silently corrupts the file, so we restart from zero.
 *  - Never buffer the body in memory; multi-GB GGUFs must stream to disk.
 */
export async function resumableDownload(
  url: string,
  dest: string,
  onProgress?: (got: number, total: number) => void,
  maxAttempts = 6,
  extraHeaders: Record<string, string> = {},
): Promise<string> {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  let offset = 0;
  try {
    offset = fs.statSync(dest).size;
  } catch {
    offset = 0;
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const headers: Record<string, string> = { ...extraHeaders };
    if (offset > 0) headers.range = `bytes=${offset}-`;

    let res;
    try {
      res = await request(url, {
        method: "GET",
        headers,
        headersTimeout: 120_000,
        bodyTimeout: 0,
      });
    } catch (e) {
      debug(`[Downloader] attempt ${attempt} connect failed: ${errMsg(e)}`);
      continue;
    }

    // Already complete.
    if (res.statusCode === 416) {
      await res.body.dump();
      return dest;
    }

    if (offset > 0 && res.statusCode !== 206) {
      await res.body.dump();
      fs.rmSync(dest, { force: true });
      offset = 0;
      continue;
    }

    if (res.statusCode !== 200 && res.statusCode !== 206) {
      await res.body.dump();
      throw new Error(`HTTP ${res.statusCode} downloading ${url}`);
    }

    const len = Number(res.headers["content-length"] ?? 0);
    const total = offset + len;
    let got = offset;

    const out = fs.createWriteStream(dest, { flags: offset > 0 ? "a" : "w" });
    const source = Readable.from(res.body as unknown as AsyncIterable<Uint8Array>);
    source.on("data", (chunk: Buffer) => {
      got += chunk.length;
      onProgress?.(got, total);
    });

    try {
      await pipeline(source, out);
    } catch (e) {
      debug(`[Downloader] attempt ${attempt} transfer interrupted: ${errMsg(e)} (${got} bytes)`);
      offset = got;
      continue;
    }

    if (len === 0 || got >= total) return dest;
    offset = got; // Socket closed early — resume from where we stopped.
  }

  throw new Error(`[Downloader] giving up after ${maxAttempts} attempts: ${dest}`);
}

/** Run a download in the background (fire and forget). */
export function downloadModelAsync(repoId: string, filename: string, token?: string): string {
  void (async () => {
    downloads.set(filename, 0);
    try {
      const dest = await downloadModel(repoId, filename, token);
      downloads.set(filename, dest ? 100 : -1);
      if (dest) info(`[Downloader] finished: ${dest}`);
    } catch (e) {
      error(`[Downloader] ${filename} failed: ${errMsg(e)}`);
      downloads.set(filename, -1);
    }
  })();

  return `Started download of ${filename}`;
}

export function getDownloadStatus(): Record<string, number> {
  return Object.fromEntries(downloads);
}

/**
 * Download a GGUF model from HuggingFace.
 * `filename` is required; returns the destination path or "" on failure.
 */
export async function downloadModel(
  repoId: string,
  filename?: string | null,
  token?: string | null,
): Promise<string> {
  info(`[Downloader] repo=${repoId} | target=${filename ?? "auto"}`);

  try {
    if (!filename) {
      error("Filename is required (e.g. 'Llama-3.2-3B-Instruct-Q4_K_M.gguf')");
      return "";
    }

    const url = `https://huggingface.co/${repoId}/resolve/main/${encodeURIComponent(filename)}`;
    const dest = path.join(MODELS_DIR, path.basename(filename));

    const auth: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};

    await resumableDownload(
      url,
      dest,
      (got, total) => {
        if (total > 0) downloads.set(filename, Math.floor((got / total) * 100));
      },
      6,
      auth,
    );

    info(`[Downloader] success -> ${dest}`);
    return dest;
  } catch (e) {
    error(`[Downloader] failed: ${errMsg(e)}`);
    return "";
  }
}
