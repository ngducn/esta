import type { Result } from '@esta/core/result';
import type { FileProblem, FileRefusal } from '@esta/ops';
import { constants, type Stats } from 'node:fs';
import { open, readdir, readlink, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const DEFAULT_IMPORT_FOLDER = 'Esta-import';

/** One entry of a folder: what Claude may read, or why it may not, the same answer a read of it would give. */
export type FolderEntry =
  | { readonly name: string; readonly kind: 'folder' }
  | { readonly name: string; readonly kind: 'file'; readonly size: number }
  | { readonly name: string; readonly kind: 'refused'; readonly problem: FileProblem };
export type ReadFile = { readonly name: string; readonly bytes: Buffer };

/** As many links as macOS follows in one path (MAXSYMLINKS) before it calls them a loop. */
const MAX_LINKS = 32;

const refused = (problem: FileProblem): Result<never, FileRefusal> => ({ ok: false, reason: { kind: 'file', problem } });

const expand = (path: string, home: string) => (path === '~' ? home : path.startsWith('~/') ? join(home, path.slice(2)) : path);

/** A regular file with a second name may be the same bytes as a file outside the folders, so it counts as outside. */
const fileProblem = (stats: Stats): FileProblem | null => (!stats.isFile() ? 'not_a_file' : stats.nlink > 1 ? 'outside_import_folders' : null);

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

/** A file system call's value, or the problem its failure means: the system's own error text never leaves. */
const attempt = <T>(call: Promise<T>, problem: (error: unknown) => FileProblem | Promise<FileProblem>): Promise<Result<T, FileRefusal>> =>
  call.then(
    (value) => ({ ok: true, value }),
    async (error: unknown) => refused(await problem(error)),
  );

/** The real path of the deepest part of `path` that resolves, and the names after it. */
async function deepestReal(path: string): Promise<{ real: string; rest: readonly string[] }> {
  const rest: string[] = [];
  for (let at = path; ; at = dirname(at)) {
    const real = await realpath(at).catch(() => null);
    if (real !== null) return { real, rest };
    rest.unshift(basename(at));
  }
}

/**
 * Ryan's files, only inside the import folders. A path is followed to its real location first, so a symlink that
 * leaves the folders is refused like any path outside them. A relative path starts at the first folder.
 */
export function importFolders(roots: readonly string[], home = homedir()) {
  const inside = (target: string) => roots.some((root) => within(root, target));

  /**
   * Why a path that does not resolve is refused. It is followed as far as it exists, through every link on the way, and
   * is `missing` only where it stops inside the folders, so the answer never tells what exists elsewhere on the Mac.
   */
  async function unresolved(path: string, error: unknown): Promise<FileProblem> {
    let current = path;
    for (let links = 0; links <= MAX_LINKS; links++) {
      const { real, rest } = await deepestReal(current);
      if (!inside(real)) return 'outside_import_folders';
      const [next = '', ...more] = rest;
      const link = await readlink(join(real, next)).catch(() => null);
      if (link === null) return ['ENOENT', 'ENOTDIR'].includes(String(errorCode(error))) ? 'missing' : 'unreadable';
      current = join(resolve(real, link), ...more);
    }
    return 'unreadable';
  }

  /** The real path of a file or folder Claude may read. */
  async function locate(path: string): Promise<Result<string, FileRefusal>> {
    const [first] = roots;
    if (first === undefined) return refused('outside_import_folders');
    const wanted = resolve(first, expand(path, home));
    const real = await attempt(realpath(wanted), (error) => unresolved(wanted, error));
    if (!real.ok) return real;
    return inside(real.value) ? real : refused('outside_import_folders');
  }

  /** What a listing says of one entry: the checks a read makes, without opening the file. */
  async function entry(folder: string, name: string): Promise<FolderEntry> {
    const located = await locate(join(folder, name));
    const stats = located.ok ? await attempt(stat(located.value), () => 'unreadable') : located;
    if (!stats.ok) return { name, kind: 'refused', problem: stats.reason.problem };
    if (stats.value.isDirectory()) return { name, kind: 'folder' };
    const problem = fileProblem(stats.value);
    return problem === null ? { name, kind: 'file', size: stats.value.size } : { name, kind: 'refused', problem };
  }

  return {
    roots,

    /** One level of a folder: names, kinds and file sizes, never contents. Hidden files are left out. */
    async list(path: string): Promise<Result<readonly FolderEntry[], FileRefusal>> {
      const folder = await locate(path);
      if (!folder.ok) return folder;
      const names = await attempt(readdir(folder.value), (error) => (errorCode(error) === 'ENOTDIR' ? 'not_a_file' : 'unreadable'));
      if (!names.ok) return names;
      const listed = await Promise.all(names.value.filter((name) => !name.startsWith('.')).map((name) => entry(folder.value, name)));
      return { ok: true, value: listed.toSorted((a, b) => a.name.localeCompare(b.name, 'vi')) };
    },

    /**
     * A regular file of at most `limit` bytes. The real path is opened without following a link and without waiting on
     * a named pipe, then checked by its handle.
     */
    async read(path: string, limit: number): Promise<Result<ReadFile, FileRefusal>> {
      const located = await locate(path);
      if (!located.ok) return located;
      const opened = await attempt(open(located.value, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK), (error) =>
        errorCode(error) === 'ELOOP' ? 'outside_import_folders' : 'unreadable',
      );
      if (!opened.ok) return opened;
      const handle = opened.value;
      try {
        const stats = await handle.stat();
        const problem = fileProblem(stats) ?? (stats.size > limit ? 'too_large' : null);
        if (problem !== null) return refused(problem);
        const bytes = await handle.readFile();
        return bytes.length > limit ? refused('too_large') : { ok: true, value: { name: basename(located.value), bytes } };
      } finally {
        await handle.close();
      }
    },
  };
}

export type ImportFolders = ReturnType<typeof importFolders>;
