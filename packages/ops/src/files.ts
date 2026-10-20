import type { DocumentMimeType } from '@esta/core/documents';
import type { Result } from '@esta/core/result';
import type { OpContext } from './op';

/** A document file on Ryan's Mac with the bytes that were hashed, so what gets uploaded is what was checked. */
export type LocalFile = {
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly size: number;
  readonly sha256: string;
  readonly mime: DocumentMimeType;
  readonly pageCount: number;
};

/** The two copies the vault shows before the file itself (`@esta/core/documents/previews`), as WebP bytes. */
export type LocalPreviews = { readonly thumb: Uint8Array; readonly review: Uint8Array };

/**
 * `unreadable`: the Mac refuses to open it, or its links loop. `id_number_in_name`: its path or name holds a full
 * national ID number, which a plan or a document would store (SPEC D11), so Ryan renames it.
 */
export type FileProblem = 'outside_import_folders' | 'missing' | 'not_a_file' | 'unreadable' | 'id_number_in_name' | 'too_large' | 'unsupported_type';
export type FileRefusal = { readonly kind: 'file'; readonly problem: FileProblem };

/** What the connector can do with files on Ryan's Mac, and only inside the import folders he configured. */
export type LocalFiles = {
  /** A regular file within the vault's size limit, of a type the vault takes, whose path and name hold no ID number. */
  readDocument(path: string): Promise<Result<LocalFile, FileRefusal>>;
  previews(file: LocalFile): Promise<LocalPreviews>;
};

/** The context of an op that reads Ryan's files. Only the connector builds one, so no server action can run such an op. */
export type LocalContext = OpContext & { readonly files: LocalFiles };
