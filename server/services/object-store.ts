/**
 * object-store.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified object storage abstraction with two backends:
 *
 *   LOCAL  — stores files to the `uploads/` directory (default, backward-compatible)
 *   S3     — stores files to any S3-compatible bucket (AWS, MinIO, Cloudflare R2, DO Spaces)
 *
 * Backend is selected by the OBJECT_STORE_BACKEND environment variable:
 *   OBJECT_STORE_BACKEND=local   (default)
 *   OBJECT_STORE_BACKEND=s3
 *
 * S3 configuration (only required when OBJECT_STORE_BACKEND=s3):
 *   OBJECT_STORE_S3_BUCKET
 *   OBJECT_STORE_S3_REGION          (default: us-east-1)
 *   OBJECT_STORE_S3_ENDPOINT        (optional, for MinIO/R2/DO Spaces)
 *   OBJECT_STORE_S3_ACCESS_KEY_ID
 *   OBJECT_STORE_S3_SECRET_ACCESS_KEY
 *   OBJECT_STORE_S3_PATH_STYLE      (set to "true" for MinIO)
 *
 * URI format returned by put():
 *   local://filename.ext           — local disk
 *   s3://bucket/key                — S3-compatible storage
 */

import fs from "fs";
import path from "path";

// ─── Interface ────────────────────────────────────────────────────────────────

export interface ObjectStore {
  /**
   * Store a file. Returns a URI that can be passed back to get()/delete().
   */
  put(key: string, data: Buffer | NodeJS.ReadableStream, contentType?: string): Promise<string>;

  /**
   * Retrieve a file as a Buffer.
   */
  get(uri: string): Promise<Buffer>;

  /**
   * Delete a file by its URI.
   */
  delete(uri: string): Promise<void>;

  /**
   * Check whether a file exists.
   */
  exists(uri: string): Promise<boolean>;

  /**
   * Return a backend-specific identifier string for logging.
   */
  readonly backendName: string;
}

// ─── Local Disk Backend ───────────────────────────────────────────────────────

class LocalDiskBackend implements ObjectStore {
  readonly backendName = "local";
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
  }

  async put(key: string, data: Buffer | NodeJS.ReadableStream, _contentType?: string): Promise<string> {
    const filePath = path.join(this.baseDir, key);
    // Ensure no path traversal
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(this.baseDir))) {
      throw Object.assign(new Error("Path traversal detected in object store key"), { status: 400 });
    }

    if (Buffer.isBuffer(data)) {
      await fs.promises.writeFile(filePath, data);
    } else {
      await new Promise<void>((resolve, reject) => {
        const ws = fs.createWriteStream(filePath);
        data.pipe(ws);
        ws.on("finish", resolve);
        ws.on("error", reject);
        (data as any).on?.("error", reject);
      });
    }
    return `local://${key}`;
  }

  async get(uri: string): Promise<Buffer> {
    const key = this.keyFromUri(uri);
    const filePath = path.join(this.baseDir, key);
    if (!fs.existsSync(filePath)) {
      throw Object.assign(new Error(`Object not found: ${uri}`), { status: 404 });
    }
    return fs.promises.readFile(filePath);
  }

  async delete(uri: string): Promise<void> {
    const key = this.keyFromUri(uri);
    const filePath = path.join(this.baseDir, key);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }

  async exists(uri: string): Promise<boolean> {
    const key = this.keyFromUri(uri);
    const filePath = path.join(this.baseDir, key);
    return fs.existsSync(filePath);
  }

  /** Resolve a local:// URI back to a file system path (for sendFile compatibility). */
  resolveLocalPath(uri: string): string {
    return path.join(this.baseDir, this.keyFromUri(uri));
  }

  private keyFromUri(uri: string): string {
    if (uri.startsWith("local://")) return uri.slice(8);
    // Also accept raw filenames for backward compatibility
    return path.basename(uri);
  }
}

// ─── S3 Backend ───────────────────────────────────────────────────────────────

class S3Backend implements ObjectStore {
  readonly backendName = "s3";
  private readonly bucket: string;
  private client: any = null;

  constructor(private readonly config: {
    bucket: string;
    region: string;
    endpoint?: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle?: boolean;
  }) {
    this.bucket = config.bucket;
  }

  private async getClient() {
    if (this.client) return this.client;
    // Dynamically import AWS SDK v3 — only required when S3 backend is active
    try {
      const { S3Client } = await import("@aws-sdk/client-s3" as any);
      this.client = new S3Client({
        region: this.config.region,
        endpoint: this.config.endpoint,
        forcePathStyle: this.config.forcePathStyle ?? false,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        },
      });
      return this.client;
    } catch {
      throw new Error(
        "S3 backend requires @aws-sdk/client-s3. Run: npm install @aws-sdk/client-s3 @aws-sdk/lib-storage"
      );
    }
  }

  async put(key: string, data: Buffer | NodeJS.ReadableStream, contentType = "application/octet-stream"): Promise<string> {
    const client = await this.getClient();
    const { Upload } = await import("@aws-sdk/lib-storage" as any);
    const upload = new Upload({
      client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      },
    });
    await upload.done();
    return `s3://${this.bucket}/${key}`;
  }

  async get(uri: string): Promise<Buffer> {
    const client = await this.getClient();
    const { GetObjectCommand } = await import("@aws-sdk/client-s3" as any);
    const key = this.keyFromUri(uri);
    const resp = await client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const stream: NodeJS.ReadableStream = resp.Body;
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  }

  async delete(uri: string): Promise<void> {
    const client = await this.getClient();
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3" as any);
    const key = this.keyFromUri(uri);
    await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(uri: string): Promise<boolean> {
    const client = await this.getClient();
    const { HeadObjectCommand } = await import("@aws-sdk/client-s3" as any);
    const key = this.keyFromUri(uri);
    try {
      await client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (err: any) {
      if (err?.name === "NotFound" || err?.$metadata?.httpStatusCode === 404) return false;
      throw err;
    }
  }

  private keyFromUri(uri: string): string {
    if (uri.startsWith("s3://")) {
      const withoutScheme = uri.slice(5);
      const slashIdx = withoutScheme.indexOf("/");
      return slashIdx === -1 ? withoutScheme : withoutScheme.slice(slashIdx + 1);
    }
    return uri;
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

function createObjectStore(): ObjectStore & { resolveLocalPath?: (uri: string) => string } {
  const backend = (process.env.OBJECT_STORE_BACKEND ?? "local").toLowerCase();

  if (backend === "s3") {
    const bucket = process.env.OBJECT_STORE_S3_BUCKET;
    const accessKeyId = process.env.OBJECT_STORE_S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.OBJECT_STORE_S3_SECRET_ACCESS_KEY;

    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "S3 object store requires OBJECT_STORE_S3_BUCKET, OBJECT_STORE_S3_ACCESS_KEY_ID, and OBJECT_STORE_S3_SECRET_ACCESS_KEY"
      );
    }

    console.log(`[ObjectStore] Using S3 backend — bucket: ${bucket}`);
    return new S3Backend({
      bucket,
      region: process.env.OBJECT_STORE_S3_REGION ?? "us-east-1",
      endpoint: process.env.OBJECT_STORE_S3_ENDPOINT,
      accessKeyId,
      secretAccessKey,
      forcePathStyle: process.env.OBJECT_STORE_S3_PATH_STYLE === "true",
    });
  }

  // Default: local disk
  const uploadsDir = path.join(process.cwd(), "uploads");
  console.log(`[ObjectStore] Using local disk backend — path: ${uploadsDir}`);
  return new LocalDiskBackend(uploadsDir);
}

/**
 * Singleton object store instance.
 * Swap backend by changing OBJECT_STORE_BACKEND env var — no code changes needed.
 */
export const objectStore = createObjectStore();

/**
 * Convenience helper: resolve a stored URI to a local filesystem path.
 * Only works for local:// URIs. Throws for S3 URIs.
 */
export function resolveLocalPath(uri: string): string {
  if ("resolveLocalPath" in objectStore && typeof (objectStore as any).resolveLocalPath === "function") {
    return (objectStore as any).resolveLocalPath(uri);
  }
  throw new Error("resolveLocalPath() is only available for the local disk backend");
}
