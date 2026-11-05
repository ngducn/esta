export type EntryData = Uint8Array | AsyncIterable<Uint8Array>;

/** `size` is the entry's weight when known up front, so a sink can start a new part before a big file instead of after. */
export interface ExportSink {
  add(path: string, data: EntryData, size?: number): Promise<void>;
  /** Writes the manifest last, into the last part, and hands `manifest` every part's name. */
  finish(manifest: (parts: readonly string[]) => Uint8Array): Promise<void>;
}
