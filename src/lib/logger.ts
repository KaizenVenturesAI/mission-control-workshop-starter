export function logFetch(source: string, success: boolean, durationMs: number, fallback: boolean, error?: string) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), source, success, durationMs, fallback, error }));
}
