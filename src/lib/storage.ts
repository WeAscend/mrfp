// File storage behind one interface: local disk for a single-machine install, S3-compatible object storage when hosted.
// Keys are always "<orgId>/<clientId>/<fileId>-<name>" so a tenant's files live under its own prefix.
import { promises as fs } from "fs";
import path from "path";

export interface StorageDriver {
  put(key: string, data: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

class LocalDriver implements StorageDriver {
  constructor(private root: string) {}
  private p(key: string) { const full = path.resolve(this.root, key); if (!full.startsWith(path.resolve(this.root))) throw new Error("bad key"); return full; }
  async put(key: string, data: Buffer) { const f = this.p(key); await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f, data); }
  async get(key: string) { return fs.readFile(this.p(key)); }
  async delete(key: string) { await fs.rm(this.p(key), { force: true }); }
}

class S3Driver implements StorageDriver {
  private client: import("@aws-sdk/client-s3").S3Client | null = null;
  constructor(private bucket: string) {}
  private async c() { if (!this.client) { const { S3Client } = await import("@aws-sdk/client-s3"); this.client = new S3Client({ region: process.env.S3_REGION || "ap-southeast-2", endpoint: process.env.S3_ENDPOINT || undefined, forcePathStyle: !!process.env.S3_ENDPOINT }); } return this.client; }
  async put(key: string, data: Buffer, mime: string) { const { PutObjectCommand } = await import("@aws-sdk/client-s3"); await (await this.c()).send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: mime })); }
  async get(key: string) { const { GetObjectCommand } = await import("@aws-sdk/client-s3"); const r = await (await this.c()).send(new GetObjectCommand({ Bucket: this.bucket, Key: key })); return Buffer.from(await r.Body!.transformToByteArray()); }
  async delete(key: string) { const { DeleteObjectCommand } = await import("@aws-sdk/client-s3"); await (await this.c()).send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })); }
}

let driver: StorageDriver | null = null;
export function storage(): StorageDriver {
  if (driver) return driver;
  driver = process.env.STORAGE_DRIVER === "s3" ? new S3Driver(process.env.S3_BUCKET!) : new LocalDriver(process.env.STORAGE_LOCAL_DIR || (process.env.VERCEL ? "/tmp/mrfp-storage" : "./storage"));
  return driver;
}
export const safeName = (n: string) => n.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 120);
