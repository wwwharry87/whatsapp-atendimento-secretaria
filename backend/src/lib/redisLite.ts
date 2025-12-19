// src/lib/redisLite.ts
import net from "node:net";
import tls from "node:tls";
import { URL } from "node:url";

type RespValue = string | number | null | RespValue[] | Buffer;

type Pending = {
  resolve: (v: any) => void;
  reject: (e: any) => void;
};

function encodeCommand(args: Array<string | number | Buffer>): Buffer {
  const parts: Buffer[] = [];
  parts.push(Buffer.from(`*${args.length}\r\n`));
  for (const a of args) {
    const b =
      Buffer.isBuffer(a) ? a : Buffer.from(typeof a === "number" ? String(a) : a, "utf8");
    parts.push(Buffer.from(`$${b.length}\r\n`));
    parts.push(b);
    parts.push(Buffer.from("\r\n"));
  }
  return Buffer.concat(parts);
}

function readLine(buf: Buffer, offset: number): { line: Buffer; next: number } | null {
  const idx = buf.indexOf("\r\n", offset);
  if (idx === -1) return null;
  const line = buf.slice(offset, idx);
  return { line, next: idx + 2 };
}

function parseResp(buf: Buffer, offset: number): { value: RespValue; next: number } | null {
  if (offset >= buf.length) return null;
  const prefix = buf[offset];
  // Simple String
  if (prefix === 43 /* + */) {
    const line = readLine(buf, offset + 1);
    if (!line) return null;
    return { value: line.line.toString("utf8"), next: line.next };
  }
  // Error
  if (prefix === 45 /* - */) {
    const line = readLine(buf, offset + 1);
    if (!line) return null;
    const msg = line.line.toString("utf8");
    const err: any = new Error(msg);
    err.name = "RedisError";
    return { value: err as any, next: line.next };
  }
  // Integer
  if (prefix === 58 /* : */) {
    const line = readLine(buf, offset + 1);
    if (!line) return null;
    return { value: parseInt(line.line.toString("utf8"), 10), next: line.next };
  }
  // Bulk String
  if (prefix === 36 /* $ */) {
    const line = readLine(buf, offset + 1);
    if (!line) return null;
    const len = parseInt(line.line.toString("utf8"), 10);
    if (len === -1) return { value: null, next: line.next };
    const end = line.next + len;
    if (buf.length < end + 2) return null;
    const data = buf.slice(line.next, end);
    // skip \r\n
    return { value: data, next: end + 2 };
  }
  // Array
  if (prefix === 42 /* * */) {
    const line = readLine(buf, offset + 1);
    if (!line) return null;
    const count = parseInt(line.line.toString("utf8"), 10);
    if (count === -1) return { value: null, next: line.next };
    let cur = line.next;
    const arr: RespValue[] = [];
    for (let i = 0; i < count; i++) {
      const parsed = parseResp(buf, cur);
      if (!parsed) return null;
      arr.push(parsed.value);
      cur = parsed.next;
    }
    return { value: arr, next: cur };
  }
  return null;
}

/**
 * Cliente Redis mínimo (RESP2) - sem dependências externas.
 * Suporta comandos simples (GET/SET/DEL/EVAL/PING) e reconexão sob demanda.
 */
export class RedisLite {
  private url: URL;
  private socket: net.Socket | tls.TLSSocket | null = null;
  private connected = false;
  private connecting: Promise<void> | null = null;
  private buffer: Buffer = Buffer.alloc(0);
  private pending: Pending[] = [];

  constructor(redisUrl: string) {
    this.url = new URL(redisUrl);
  }

  isEnabled() {
    return !!this.url;
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected && this.socket) return;
    if (this.connecting) return this.connecting;

    this.connecting = new Promise<void>((resolve, reject) => {
      const isTls = this.url.protocol === "rediss:";
      const port = this.url.port ? parseInt(this.url.port, 10) : 6379;
      const host = this.url.hostname;

      const onConnect = async () => {
        this.connected = true;
        this.connecting = null;

        // AUTH (se tiver password no URL)
        const pass = this.url.password ? decodeURIComponent(this.url.password) : "";
        try {
          if (pass) {
            await this.command(["AUTH", pass]);
          }
          // SELECT db (se vier /<db>)
          const dbStr = (this.url.pathname || "/").replace("/", "");
          if (dbStr) {
            const db = parseInt(dbStr, 10);
            if (!Number.isNaN(db)) await this.command(["SELECT", String(db)]);
          }
          resolve();
        } catch (e) {
          reject(e);
        }
      };

      const onError = (err: any) => {
        this.connecting = null;
        reject(err);
      };

      const sock = isTls
        ? tls.connect(
            {
              host,
              port,
              servername: host,
            },
            onConnect
          )
        : net.createConnection({ host, port }, onConnect);

      sock.on("data", (chunk: Buffer) => this.onData(chunk));
      sock.on("error", (err) => this.onSocketError(err));
      sock.on("close", () => this.onSocketClose());

      this.socket = sock;
      // if connect errors before onConnect:
      sock.once("error", onError);
    });

    return this.connecting;
  }

  private onSocketError(err: any) {
    // rejeita pendências atuais
    while (this.pending.length) {
      const p = this.pending.shift()!;
      p.reject(err);
    }
  }

  private onSocketClose() {
    this.connected = false;
    this.socket = null;
  }

  private onData(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (true) {
      const parsed = parseResp(this.buffer, 0);
      if (!parsed) break;

      const value = parsed.value;
      this.buffer = this.buffer.slice(parsed.next);

      const p = this.pending.shift();
      if (!p) continue;

      if (value instanceof Error) {
        p.reject(value);
      } else if (Buffer.isBuffer(value)) {
        p.resolve(value.toString("utf8"));
      } else if (Array.isArray(value)) {
        // converte buffers dentro do array para string
        const conv = value.map((v) =>
          Buffer.isBuffer(v as any) ? (v as any).toString("utf8") : v
        );
        p.resolve(conv);
      } else {
        p.resolve(value);
      }
    }
  }

  async command(args: Array<string | number | Buffer>): Promise<any> {
    await this.ensureConnected();
    if (!this.socket) throw new Error("Redis socket não conectado.");

    return new Promise((resolve, reject) => {
      const payload = encodeCommand(args);
      this.pending.push({ resolve, reject });

      try {
        this.socket!.write(payload);
      } catch (e) {
        // remove pending
        const p = this.pending.pop();
        p?.reject(e);
      }
    });
  }

  async ping(): Promise<boolean> {
    try {
      const r = await this.command(["PING"]);
      return r === "PONG";
    } catch {
      return false;
    }
  }

  async get(key: string): Promise<string | null> {
    const r = await this.command(["GET", key]);
    return r == null ? null : String(r);
  }

  async set(
    key: string,
    value: string,
    opts?: { exSeconds?: number; pxMs?: number; nx?: boolean }
  ): Promise<"OK" | null> {
    const args: any[] = ["SET", key, value];
    if (opts?.exSeconds) args.push("EX", String(opts.exSeconds));
    if (opts?.pxMs) args.push("PX", String(opts.pxMs));
    if (opts?.nx) args.push("NX");
    const r = await this.command(args);
    return r == null ? null : "OK";
  }

  async del(key: string): Promise<number> {
    const r = await this.command(["DEL", key]);
    return typeof r === "number" ? r : parseInt(String(r || "0"), 10);
  }

  async eval(script: string, keys: string[], args: string[]): Promise<any> {
    const cmd = ["EVAL", script, String(keys.length), ...keys, ...args];
    return this.command(cmd);
  }
}
