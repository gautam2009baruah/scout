import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export type StoredFile = Buffer | Uint8Array | ArrayBuffer;

export interface StorageProvider {
  save_file(file: StoredFile, storagePath: string): Promise<void>;
  get_file(storagePath: string): Promise<Buffer>;
  delete_file(storagePath: string): Promise<void>;
  file_exists(storagePath: string): Promise<boolean>;
}

function storageRoot() {
  return process.env.STORAGE_ROOT || "./storage";
}

function normalizeStoragePath(storagePath: string) {
  const cleanPath = storagePath.replace(/\\/g, "/").replace(/^\/+/, "");

  if (!cleanPath || cleanPath.includes("..")) {
    throw new Error("Invalid storage path.");
  }

  return cleanPath;
}

export class LocalFilesystemStorageProvider implements StorageProvider {
  private root: string;

  constructor(root = storageRoot()) {
    this.root = path.resolve(/* turbopackIgnore: true */ process.cwd(), root);
  }

  private resolve(storagePath: string) {
    const resolved = path.resolve(this.root, normalizeStoragePath(storagePath));

    if (!resolved.startsWith(this.root + path.sep) && resolved !== this.root) {
      throw new Error("Storage path escapes the configured storage root.");
    }

    return resolved;
  }

  async save_file(file: StoredFile, storagePath: string) {
    const target = this.resolve(storagePath);
    await mkdir(path.dirname(target), { recursive: true });
    const buffer = file instanceof ArrayBuffer ? Buffer.from(file) : Buffer.from(file);
    await writeFile(target, buffer);
  }

  async get_file(storagePath: string) {
    return readFile(this.resolve(storagePath));
  }

  async delete_file(storagePath: string) {
    await rm(this.resolve(storagePath), { force: true });
  }

  async file_exists(storagePath: string) {
    try {
      const fileStat = await stat(this.resolve(storagePath));
      return fileStat.isFile();
    } catch {
      return false;
    }
  }
}

export function getStorageProvider(): StorageProvider {
  const provider = process.env.STORAGE_PROVIDER || "local";

  if (provider === "local") {
    return new LocalFilesystemStorageProvider();
  }

  throw new Error(`Unsupported storage provider: ${provider}`);
}
