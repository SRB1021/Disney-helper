// fetch with one retry on network-level failures (not on HTTP error statuses).
async function fetchRetry(url, opts, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fetch(url, { signal: AbortSignal.timeout(15_000), ...opts });
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  const cause = lastErr?.cause?.code || lastErr?.cause?.message || lastErr?.message;
  throw new Error(`network error (${cause})`);
}
module.exports = { fetchRetry };
