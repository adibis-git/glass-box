// Storage abstraction for dataset artifacts (raw uploads + normalized CSVs).
//
//   STORAGE_DRIVER=disk  (default) → local filesystem under DATA_DIR
//   STORAGE_DRIVER=s3               → S3-compatible bucket (AWS S3 / Cloudflare R2)
//
// Keys are opaque paths like "org/<orgId>/datasets/<datasetId>/normalized.csv".

import type { Readable } from "node:stream";
import { LocalDiskDriver } from "./disk";

export interface StorageDriver {
  put(key: string, data: Readable | Buffer | string): Promise<{ bytes: number }>;
  /** Full-object or byte-range read (range needed by the strided sampler). */
  getStream(key: string, range?: { start: number; end: number }): Promise<Readable>;
  getText(key: string): Promise<string>;
  delete(key: string): Promise<void>;
  size(key: string): Promise<number>;
}

let driver: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (driver) return driver;
  const kind = process.env.STORAGE_DRIVER ?? "disk";
  if (kind === "s3") {
    // Deferred: S3Driver lands with the deploy phase. Fail loudly, not silently.
    throw new Error("STORAGE_DRIVER=s3 is not wired up yet — use disk.");
  }
  driver = new LocalDiskDriver(process.env.DATA_DIR ?? ".data");
  return driver;
}
