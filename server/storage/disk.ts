// Local-filesystem StorageDriver — dev + single-host demo deployments
// (persistent volume on Railway/Render). Keys map to sharded paths under root.

import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import type { StorageDriver } from "./index";

export class LocalDiskDriver implements StorageDriver {
  constructor(private root: string) {}

  private resolve(key: string): string {
    // Prevent path traversal: normalized path must stay under root.
    const safe = normalize(join(this.root, key));
    const rootAbs = normalize(this.root + sep);
    if (!safe.startsWith(normalize(this.root)) || key.includes("..")) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    void rootAbs;
    return safe;
  }

  async put(key: string, data: Readable | Buffer | string): Promise<{ bytes: number }> {
    const path = this.resolve(key);
    await mkdir(dirname(path), { recursive: true });
    if (typeof data === "string" || Buffer.isBuffer(data)) {
      const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
      await pipeline(Readable.from(buf), createWriteStream(path));
      return { bytes: buf.length };
    }
    await pipeline(data, createWriteStream(path));
    const s = await stat(path);
    return { bytes: s.size };
  }

  async getStream(key: string, range?: { start: number; end: number }): Promise<Readable> {
    const path = this.resolve(key);
    return createReadStream(path, range ? { start: range.start, end: range.end } : undefined);
  }

  async getText(key: string): Promise<string> {
    return readFile(this.resolve(key), "utf8");
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  async size(key: string): Promise<number> {
    const s = await stat(this.resolve(key));
    return s.size;
  }
}
