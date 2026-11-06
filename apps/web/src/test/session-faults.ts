import type { SupabaseClient } from '@supabase/supabase-js';

/** The member's session, except the first call of the accepting function comes back failed, as a cut connection would leave it. */
export const acceptCutOnce = (client: SupabaseClient): SupabaseClient => {
  let cut = false;
  const cutOnce = (name: string, args: never) => (name !== 'accept_extraction' || cut ? client.rpc(name, args) : ((cut = true), Promise.resolve({ data: null, error: { code: '08006', message: 'connection cut' } })));
  return new Proxy(client, { get: (target, property, receiver) => (property === 'rpc' ? cutOnce : Reflect.get(target, property, receiver)) });
};

/**
 * The member's session, except the first save to reach its last write holds it until the other save has made its own;
 * `held` settles once the first is waiting, so the test starts the other save only then.
 * The last write is the accepting function here and the `document_extractions` update on main, which wrote the steps
 * as separate calls; held that way, the earlier save lands last, so a split save leaves the rows of one save and the
 * record of the other.
 */
export function holdFirstLastWrite(client: SupabaseClient): { client: SupabaseClient; held: Promise<void> } {
  let arrived = 0;
  let waiting: () => void = () => undefined;
  const held = new Promise<void>((resolve) => (waiting = resolve));
  let release: () => void = () => undefined;
  const second = new Promise<void>((resolve) => (release = resolve));
  const lastWrite = async <T>(run: () => PromiseLike<T>): Promise<T> => {
    if (arrived++ === 0) {
      waiting();
      await second;
      return run();
    }
    const result = await run();
    release();
    return result;
  };
  const delayed = (builder: object): object =>
    new Proxy(builder, {
      get(target, property, receiver) {
        if (property === 'then') return (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => lastWrite(async () => await (target as Promise<unknown>)).then(resolve, reject);
        const value: unknown = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? (...args: unknown[]) => delayed((value as (...rest: unknown[]) => object).apply(target, args)) : value;
      },
    });
  const proxied = new Proxy(client, {
    get(target, property, receiver) {
      if (property === 'rpc') return (name: string, args: never) => (name === 'accept_extraction' ? lastWrite(() => target.rpc(name, args)) : target.rpc(name, args));
      if (property === 'from')
        return (table: string) => {
          const builder = target.from(table as never);
          if (table !== 'document_extractions') return builder;
          return new Proxy(builder, {
            get(b, key, r) {
              const value: unknown = Reflect.get(b, key, r);
              return key === 'update' && typeof value === 'function' ? (...args: unknown[]) => delayed((value as (...rest: unknown[]) => object).apply(b, args)) : value;
            },
          });
        };
      return Reflect.get(target, property, receiver);
    },
  });
  return { client: proxied, held };
}

/** The member's session, except the address lookup answers with an error, as a dropped connection would leave it. */
export const addressLookupFails = (client: SupabaseClient) =>
  new Proxy(client, {
    get: (target, property, receiver) =>
      property !== 'rpc' ? Reflect.get(target, property, receiver) : (name: string, args: never) => (name === 'suggest_current_unit' ? { select: async () => ({ data: null, error: { message: 'connection cut' } }) } : target.rpc(name, args)),
  });
