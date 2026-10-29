import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config';

/** Private object storage. Objects are never publicly addressable; downloads stream through the API after authorization. */
export interface StorageDriver {
  put(key: string, body: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
}

class LocalStorage implements StorageDriver {
  constructor(private readonly root: string) {}
  private p(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error('Invalid storage key');
    return full;
  }
  async put(key: string, body: Buffer) {
    const f = this.p(key);
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, body);
  }
  async get(key: string) {
    return createReadStream(this.p(key));
  }
  async delete(key: string) {
    await fs.rm(this.p(key), { force: true });
  }
}

class S3Storage implements StorageDriver {
  private s3 = new S3Client({
    region: config().S3_REGION,
    endpoint: config().S3_ENDPOINT,
    forcePathStyle: !!config().S3_ENDPOINT,
    credentials: config().S3_ACCESS_KEY_ID ? { accessKeyId: config().S3_ACCESS_KEY_ID!, secretAccessKey: config().S3_SECRET_ACCESS_KEY ?? '' } : undefined,
  });
  async put(key: string, body: Buffer, mime: string) {
    await this.s3.send(new PutObjectCommand({ Bucket: config().S3_BUCKET, Key: key, Body: body, ContentType: mime, ServerSideEncryption: 'AES256' }));
  }
  async get(key: string) {
    const r = await this.s3.send(new GetObjectCommand({ Bucket: config().S3_BUCKET, Key: key }));
    return r.Body as Readable;
  }
  async delete(key: string) {
    await this.s3.send(new DeleteObjectCommand({ Bucket: config().S3_BUCKET, Key: key }));
  }
}

let driver: StorageDriver | null = null;
export function storage(): StorageDriver {
  if (!driver) driver = config().STORAGE_DRIVER === 's3' ? new S3Storage() : new LocalStorage(path.resolve(config().STORAGE_LOCAL_DIR));
  return driver;
}

export async function readStreamToString(s: Readable, max = 300_000): Promise<string> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of s) {
    const b = Buffer.isBuffer(c) ? c : Buffer.from(c);
    chunks.push(b);
    n += b.length;
    if (n > max) break;
  }
  return Buffer.concat(chunks).toString('utf8').slice(0, max);
}
