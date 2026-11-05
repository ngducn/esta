export type EntryData = Uint8Array | AsyncIterable<Uint8Array>;

/**
 * Where an export goes. The web writes ZIP parts to Storage; the nightly backup will write a directory. `size` is what
 * the entry will weigh when it is known up front, so a sink can start a new part before a big file instead of after.
 */
export interface ExportSink {
  add(path: string, data: EntryData, size?: number): Promise<void>;
  /** Writes the manifest last, into the last part, and hands `manifest` every part's name. */
  finish(manifest: (parts: readonly string[]) => Uint8Array): Promise<void>;
}
