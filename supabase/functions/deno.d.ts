// Just enough of the Deno runtime for `tsc -p supabase/functions` (typechecking
// on Node). The Edge Runtime provides the real thing.
declare namespace Deno {
  const env: {
    get(key: string): string | undefined;
    toObject(): Record<string, string>;
  };
  function serve(handler: (request: Request) => Response | Promise<Response>): void;
}
