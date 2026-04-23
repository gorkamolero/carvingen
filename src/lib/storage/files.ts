import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function ensureDir(path: string) {
  await mkdir(path, { recursive: true });
}

export async function writeFileIfMissing(path: string, buffer: Buffer) {
  await ensureDir(dirname(path));

  try {
    await stat(path);
  } catch {
    await writeFile(path, buffer);
  }

  return path;
}

export async function readFileBuffer(path: string) {
  return readFile(path);
}
