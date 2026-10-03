/**
 * src/voice/edge_tts.ts
 * =====================
 * Native implementation of Microsoft Edge Read Aloud TTS.
 *
 * Replaces the `msedge-tts` npm package (which required pnpm to install).
 * Uses only Node.js built-ins: `node:https`, `node:crypto`, `node:fs`, `node:path`.
 *
 * Protocol reference: https://github.com/rany2/edge-tts (MIT, Python)
 * This is a clean-room TypeScript re-implementation for the Node.js runtime.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";

/* ── Constants ──────────────────────────────────────────────────────────────── */

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WSS_URL = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const VOICE_LIST_URL =
  "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=" +
  TRUSTED_CLIENT_TOKEN;

export const OUTPUT_FORMAT = {
  AUDIO_24KHZ_48KBITRATE_MONO_MP3: "audio-24khz-48kbitrate-mono-mp3",
  AUDIO_24KHZ_96KBITRATE_MONO_MP3: "audio-24khz-96kbitrate-mono-mp3",
  WEBM_24KHZ_16BIT_MONO_OPUS: "webm-24khz-16bit-mono-opus",
};

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function isoDate(): string {
  return new Date().toISOString();
}

function makeRequestId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function ssmlEscape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSsml(text: string, voice: string, rate: string, volume: string): string {
  // rate/volume come in as "+0%" / "-10%" etc — SSML needs them as "0%" / "-10%"
  const r = rate.replace(/^\+/, "");
  const v = volume.replace(/^\+/, "");
  return (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
    `<voice name='${voice}'>` +
    `<prosody rate='${r}' volume='${v}'>` +
    ssmlEscape(text) +
    `</prosody></voice></speak>`
  );
}

/* ── WebSocket (raw TCP over TLS using node:https upgrade) ─────────────────── */

/**
 * Synthesize `text` via Microsoft Edge TTS and collect the raw MP3 bytes.
 * Returns a Buffer on success, throws on failure.
 */
export async function synthesizeToBuffer(
  text: string,
  voice = "en-US-GuyNeural",
  outputFormat = OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
  rate = "-10%",
  volume = "+0%",
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const requestId = makeRequestId();
    const url =
      `${WSS_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
      `&ConnectionId=${requestId}`;

    // Parse WSS URL for manual HTTP upgrade
    const parsed = new URL(url.replace("wss://", "https://"));
    const connectHeaders: Record<string, string> = {
      Host: parsed.host,
      "Upgrade": "websocket",
      "Connection": "Upgrade",
      "Sec-WebSocket-Key": crypto.randomBytes(16).toString("base64"),
      "Sec-WebSocket-Version": "13",
      "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
      "Pragma": "no-cache",
      "Cache-Control": "no-cache",
    };

    const req = https.request(
      {
        hostname: parsed.hostname,
        port: 443,
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers: connectHeaders,
      },
      () => {
        // 101 Switching Protocols — handled via 'upgrade' event below
      },
    );

    req.on("error", reject);

    req.on("upgrade", (res, socket, head) => {
      void res; // suppress unused warning
      const audioParts: Buffer[] = [];
      if (head.length > 0) audioParts.push(head);

      let audioStarted = false;
      let done = false;
      let buf = Buffer.alloc(0);

      // ── Send configuration + SSML frames ────────────────────────────────
      const sendText = (msg: string): void => {
        const payload = Buffer.from(msg, "utf8");
        const frame = buildWsFrame(payload, 0x01); // 0x01 = text frame
        socket.write(frame);
      };

      const sendBin = (msg: Buffer): void => {
        const frame = buildWsFrame(msg, 0x02); // 0x02 = binary frame
        socket.write(frame);
      };
      void sendBin; // reserved for future binary sends

      // Frame 1: speech config
      sendText(
        `X-Timestamp:${isoDate()}\r\n` +
          `Content-Type:application/json; charset=utf-8\r\n` +
          `Path:speech.config\r\n\r\n` +
          JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: false },
                  outputFormat: outputFormat,
                },
              },
            },
          }),
      );

      // Frame 2: SSML
      const ssml = buildSsml(text, voice, rate, volume);
      sendText(
        `X-RequestId:${requestId}\r\n` +
          `Content-Type:application/ssml+xml\r\n` +
          `X-Timestamp:${isoDate()}Z\r\n` +
          `Path:ssml\r\n\r\n` +
          ssml,
      );

      // ── Receive frames ───────────────────────────────────────────────────
      socket.on("error", reject);
      socket.on("close", () => {
        if (!done) {
          if (audioParts.length > 0) {
            done = true;
            resolve(Buffer.concat(audioParts));
          } else {
            reject(new Error("Edge TTS: connection closed before audio data received"));
          }
        }
      });

      socket.on("data", (chunk: Buffer) => {
        buf = Buffer.concat([buf, chunk]);

        while (buf.length >= 2) {
          const fin = (buf[0]! & 0x80) !== 0;
          const opcode = buf[0]! & 0x0f;
          const masked = (buf[1]! & 0x80) !== 0;
          let payloadLen = buf[1]! & 0x7f;
          let offset = 2;

          if (payloadLen === 126) {
            if (buf.length < 4) break;
            payloadLen = buf.readUInt16BE(2);
            offset = 4;
          } else if (payloadLen === 127) {
            if (buf.length < 10) break;
            // Node buffers: use BigInt read but cap to safe int
            payloadLen = Number(buf.readBigUInt64BE(2));
            offset = 10;
          }

          const maskLen = masked ? 4 : 0;
          if (buf.length < offset + maskLen + payloadLen) break;

          let payload = buf.slice(offset + maskLen, offset + maskLen + payloadLen);
          if (masked) {
            const mask = buf.slice(offset, offset + 4);
            payload = Buffer.from(payload);
            for (let i = 0; i < payload.length; i++) {
              payload[i] = payload[i]! ^ mask[i % 4]!;
            }
          }

          buf = buf.slice(offset + maskLen + payloadLen);

          void fin; // we handle single-frame messages only (Edge TTS uses them)

          if (opcode === 0x08) {
            // Close frame
            socket.destroy();
            if (!done && audioParts.length > 0) {
              done = true;
              resolve(Buffer.concat(audioParts));
            } else if (!done) {
              reject(new Error("Edge TTS: server sent close frame with no audio"));
            }
            return;
          }

          if (opcode === 0x09) {
            // Ping → send Pong
            socket.write(buildWsFrame(payload, 0x0a));
            continue;
          }

          if (opcode === 0x01) {
            // Text frame — check for turn.end
            const msg = payload.toString("utf8");
            if (msg.includes("Path:turn.end")) {
              socket.destroy();
              if (!done) {
                done = true;
                resolve(Buffer.concat(audioParts));
              }
              return;
            }
            continue;
          }

          if (opcode === 0x02) {
            // Binary frame — audio data prefixed with a 2-byte header length + JSON header
            if (payload.length < 2) continue;
            const headerLen = payload.readUInt16BE(0);
            if (payload.length < 2 + headerLen) continue;
            const audioData = payload.slice(2 + headerLen);
            if (audioData.length > 0) {
              audioStarted = true;
              audioParts.push(audioData);
            }
            void audioStarted;
            continue;
          }
        }
      });
    });

    req.end();
  });
}

/* ── WebSocket frame builder ────────────────────────────────────────────────── */

function buildWsFrame(payload: Buffer, opcode: number): Buffer {
  const len = payload.length;
  let header: Buffer;
  if (len < 126) {
    header = Buffer.alloc(6);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | len; // masked
    // mask = 4 zero bytes (XOR with 0 is identity)
    header.writeUInt32BE(0, 2);
  } else if (len < 65536) {
    header = Buffer.alloc(8);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
    header.writeUInt32BE(0, 4);
  } else {
    header = Buffer.alloc(14);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
    header.writeUInt32BE(0, 10);
  }
  return Buffer.concat([header, payload]);
}

/* ── High-level API matching the msedge-tts interface ──────────────────────── */

/**
 * Drop-in replacement for the `MsEdgeTTS` class from the `msedge-tts` package.
 * Implements only the methods Axoniz uses: `setMetadata()`, `toFile()`, `close()`.
 */
export class MsEdgeTTS {
  private _voice = "en-US-GuyNeural";
  private _format = OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3;

  async setMetadata(
    voiceName: string,
    outputFormat: string,
    _metadataOptions?: { wordBoundaryEnabled?: boolean },
  ): Promise<void> {
    this._voice = voiceName;
    this._format = outputFormat;
  }

  async toFile(
    dirPath: string,
    input: string,
    options?: { rate?: string | number; volume?: string | number; pitch?: string },
  ): Promise<{ audioFilePath: string; metadataFilePath: null }> {
    const rate = String(options?.rate ?? "-10%");
    const volume = String(options?.volume ?? "+0%");

    const audioData = await synthesizeToBuffer(input, this._voice, this._format, rate, volume);

    // Name the file after the voice, matching msedge-tts behavior
    const ext = this._format.includes("mp3") ? ".mp3" : ".webm";
    const fileName = `${this._voice}${ext}`;
    const audioFilePath = path.join(dirPath, fileName);

    fs.mkdirSync(dirPath, { recursive: true });
    fs.writeFileSync(audioFilePath, audioData);

    return { audioFilePath, metadataFilePath: null };
  }

  /** No persistent connection to clean up in this implementation. */
  close(): void {
    // no-op — each synthesis call opens and closes its own connection
  }
}

/* ── Voice list (bonus: useful for voice selection UI) ─────────────────────── */

export interface EdgeVoice {
  Name: string;
  ShortName: string;
  Gender: string;
  Locale: string;
}

export async function listVoices(): Promise<EdgeVoice[]> {
  return new Promise((resolve, reject) => {
    https
      .get(
        VOICE_LIST_URL,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
              "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
          },
        },
        (res) => {
          let data = "";
          res.on("data", (c: string) => (data += c));
          res.on("end", () => {
            try {
              resolve(JSON.parse(data) as EdgeVoice[]);
            } catch (e) {
              reject(e);
            }
          });
        },
      )
      .on("error", reject);
  });
}
