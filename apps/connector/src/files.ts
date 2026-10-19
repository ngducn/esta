import type { Result } from '@esta/core/result';
import type { FileProblem, FileRefusal } from '@esta/ops';
import { constants } from 'node:fs';
import { open, readdir, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, delimiter, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const DEFAULT_IMPORT_FOLDER = 'Esta-import';

export type FolderEntry = { readonly name: string; readonly kind: 'folder' | 'file' | 'other'; readonly size?: number };
export type ReadFile = { readonly name: string; readonly bytes: Buffer };

const refused = (problem: FileProblem): Result<never, FileRefusal> => ({ ok: false, reason: { kind: 'file', problem } });

const expand = (path: string, home: string) => (path === '~' ? home : path.startsWith('~/') ? join(home, path.slice(2)) : path);

/**
 * The folders the connector may read, as real paths: `~/Esta-import` and each folder in `ESTA_IMPORT_ROOTS` (separated
 * like PATH). A folder that does not exist is left out.
 */
export async function importRoots(configured: string | undefined, home = homedir()): Promise<readonly string[]> {
  const wanted = [join(home, DEFAULT_IMPORT_FOLDER), ...(configured ?? '').split(delimiter).filter((path) => path.trim() !== '')];
  const real = await Promise.all(wanted.map((path) => realpath(resolve(expand(path.trim(), home))).catch(() => null)));
  return [...new Set(real.filter((path) => path !== null))];
}

const within = (root: string, path: string) => {
  const rest = relative(root, path);
  return rest === '' || (rest !== '..' && !rest.startsWith(`..${sep}`) && !isAbsolute(rest));
};

const errorCode = (error: unknown) => (error instanceof Error && 'code' in error ? error.code : undefined);

/**
 * Ryan's files, only inside the import folders. A path is followed to its real location first, so a symlink that
 * leaves the folders is refused like any path outside them. A relative path starts at the first folder.
 */
export function importFolders(roots: readonly string[], home = homedir()) {
  async function locate(path: string): Promise<Result<string, FileRefusal>> {
    const [first] = roots;
    if (first === undefined) return refused('outside_import_folders');
    const wanted = resolve(first, expand(path, home));
    const inside = (target: string) => roots.some((root) => within(root, target));
    const real = await realpath(wanted).catch((error: unknown) => {
      if (['ENOENT', 'ENOTDIR'].includes(String(errorCode(error)))) return null;
      throw error;
    });
    // A missing path outside the folders reads as outside, so the tools never say what exists elsewhere on the Mac.
    if (real === null) return refused(inside(wanted) ? 'missing' : 'outside_import_folders');
    return inside(real) ? { ok: true, value: real } : refused('outside_import_folders');
  }

  return {
    roots,

    /** One level of a folder: names, kinds and file sizes, never contents. Hidden files are left out. */
    async list(path: string): Promise<Result<readonly FolderEntry[], FileRefusal>> {
      const folder = await locate(path);
      if (!folder.ok) return folder;
      const entries = await readdir(folder.value, { withFileTypes: true }).catch((error: unknown) => {
        if (errorCode(error) === 'ENOTDIR') return null;
        throw error;
      });
      if (entries === null) return refused('not_a_file');
      const listed = await Promise.all(
        entries
          .filter((entry) => !entry.name.startsWith('.'))
          .map(async (entry): Promise<FolderEntry> => {
            const target = entry.isSymbolicLink() ? await locate(join(folder.value, entry.name)) : { ok: true as const, value: join(folder.value, entry.name) };
            const stats = target.ok ? await stat(target.value) : null;
            if (stats?.isDirectory()) return { name: entry.name, kind: 'folder' };
            return stats?.isFile() ? { name: entry.name, kind: 'file', size: stats.size } : { name: entry.name, kind: 'other' };
          }),
      );
      return { ok: true, value: listed.toSorted((a, b) => a.name.localeCompare(b.name, 'vi')) };
    },

    /**
     * A regular file of at most `limit` bytes. The real path is opened without following a link and without waiting on
     * a named pipe, then checked by its handle.
     */
    async read(path: string, limit: number): Promise<Result<ReadFile, FileRefusal>> {
      const located = await locate(path);
      if (!located.ok) return located;
      const handle = await open(located.value, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch((error: unknown) => {
        if (errorCode(error) === 'ELOOP') return null;
        throw error;
      });
      if (handle === null) return refused('outside_import_folders');
      try {
        const stats = await handle.stat();
        if (!stats.isFile()) return refused('not_a_file');
        if (stats.size > limit) return refused('too_large');
        const bytes = await handle.readFile();
        return bytes.length > limit ? refused('too_large') : { ok: true, value: { name: basename(located.value), bytes } };
      } finally {
        await handle.close();
      }
    },
  };
}

export type ImportFolders = ReturnType<typeof importFolders>;
