/** Runs `work` over `items` on `concurrency` workers, and returns the message of each item that threw. */
export async function runPool<T>(items: readonly T[], concurrency: number, work: (item: T) => Promise<void>): Promise<string[]> {
  const queue = [...items];
  const failures: string[] = [];
  const worker = async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      try {
        await work(item);
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return failures;
}
