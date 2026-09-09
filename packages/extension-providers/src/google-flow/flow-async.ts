export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<T>((resolve) => { timeoutId = window.setTimeout(() => resolve(fallback), timeoutMs); });
  try { return await Promise.race([promise, timeout]); }
  finally { if (timeoutId !== undefined) window.clearTimeout(timeoutId); }
}
