import "server-only";
import { createWriteStream, createReadStream, existsSync, statSync, unlinkSync } from "node:fs";
import { mkdir, readdir, rename } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";

/**
 * The model download manager.
 *
 * A model file is large, and where it comes from matters: a download
 * from an arbitrary URL is a download of an arbitrary program that will
 * later be loaded into a process. So the hosts are allowlisted, the
 * filename is checked, and the file lands in a directory the platform
 * owns.
 */

export interface DownloadJob {
  id: string;
  url: string;
  filename: string;
  targetPath: string;
  status: "queued" | "downloading" | "done" | "error";
  bytes: number;
  totalBytes: number | null;
  startedAt: string;
  finishedAt: string | null;
  error?: string;
}

/** Where a model may be fetched from. */
const ALLOWED_HOSTS = new Set([
  "huggingface.co",
  "cdn-lfs.huggingface.co",
  "cdn-lfs-us-1.hf.co",
  "cdn-lfs.hf.co",
  "hf-mirror.com",
]);

/** A filename that cannot escape the models directory. */
export function isSafeFilename(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.length >= 1 &&
    name.length <= 200 &&
    /^[A-Za-z0-9._-]+$/.test(name) &&
    !name.includes("..")
  );
}

const JOBS = new Map<string, DownloadJob>();

/**
 * Where the models live.
 *
 * Resolved once, at module load. The path is computed from the
 * environment, so it is not known at build time; the directory is
 * created and filled at runtime, and the build's file tracer is told to
 * leave it alone.
 */
const MODELS_DIR = process.env.OSIRIS_MODELS_DIR
  ? path.resolve(process.env.OSIRIS_MODELS_DIR)
  : path.resolve(process.cwd(), "models");

/** Where the models live. */
export function modelsDir(): string {
  return MODELS_DIR;
}

/**
 * Start a download.
 *
 * The file is written to a temporary name and moved into place only when
 * it has finished, so a half-written model is never mistaken for a
 * complete one.
 */
export async function startDownload(url: string, filename: string): Promise<DownloadJob> {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    throw new Error("DOWNLOAD_URL_INVALID");
  }
  if (!ALLOWED_HOSTS.has(host)) throw new Error("DOWNLOAD_HOST_NOT_ALLOWED");
  if (!isSafeFilename(filename)) throw new Error("DOWNLOAD_FILENAME_INVALID");

  const dir = modelsDir();
  await mkdir(dir, { recursive: true });
  const targetPath = path.join(dir, filename);

  const job: DownloadJob = {
    id: `dl:${Date.now()}:${filename}`,
    url, filename, targetPath,
    status: "queued",
    bytes: 0, totalBytes: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  JOBS.set(job.id, job);
  void runDownload(job);
  return job;
}

async function runDownload(job: DownloadJob): Promise<void> {
  const partial = `${job.targetPath}.partial`;
  try {
    job.status = "downloading";
    const res = await fetch(job.url, { signal: AbortSignal.timeout(3_600_000) });
    if (!res.ok || !res.body) throw new Error(`DOWNLOAD_HTTP_${res.status}`);
    const len = res.headers.get("content-length");
    job.totalBytes = len ? Number.parseInt(len, 10) : null;

    const stream = Readable.fromWeb(res.body as never);
    stream.on("data", (chunk: Buffer) => { job.bytes += chunk.length; });
    await pipeline(stream, createWriteStream(partial));

    await rename(partial, job.targetPath);
    job.status = "done";
  } catch (e) {
    job.status = "error";
    job.error = e instanceof Error ? e.message : "DOWNLOAD_FAILED";
    try { unlinkSync(partial); } catch { /* nothing to clean up */ }
  } finally {
    job.finishedAt = new Date().toISOString();
  }
}

export function listDownloads(): DownloadJob[] {
  return [...JOBS.values()];
}

export function getDownload(id: string): DownloadJob | null {
  return JOBS.get(id) ?? null;
}

/** The models already on disk. */
export interface InstalledModel {
  filename: string;
  sizeBytes: number;
  modifiedAt: string;
}

export async function listInstalledModels(): Promise<InstalledModel[]> {
  const dir = modelsDir();
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  const out: InstalledModel[] = [];
  for (const name of entries) {
    if (!isSafeFilename(name)) continue;
    const full = path.join(dir, name);
    try {
      const st = statSync(full);
      if (!st.isFile()) continue;
      out.push({ filename: name, sizeBytes: st.size, modifiedAt: new Date(st.mtimeMs).toISOString() });
    } catch { /* the file went away between listing and stat */ }
  }
  return out.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

/** Remove a downloaded model. */
export async function removeModel(filename: string): Promise<boolean> {
  if (!isSafeFilename(filename)) return false;
  const full = path.join(modelsDir(), filename);
  if (!existsSync(full)) return false;
  try {
    unlinkSync(full);
    return true;
  } catch {
    return false;
  }
}

/** Open a model file for streaming to a local server. */
export function openModel(filename: string) {
  if (!isSafeFilename(filename)) return null;
  const full = path.join(modelsDir(), filename);
  if (!existsSync(full)) return null;
  return createReadStream(full);
}
