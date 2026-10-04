/**
 * Start a recurring job. Runs on the interval only; the caller decides whether
 * to also run once at startup.
 *
 * @param {object} options
 * @param {() => Promise<any>} options.run
 * @param {number} options.intervalHours
 * @param {(err: unknown) => void} [options.onError]
 * @returns {() => void} stop function
 */
export function startScheduler({ run, intervalHours, onError }) {
  const intervalMs = Math.max(60_000, intervalHours * 60 * 60 * 1000);
  let running = false;

  const timer = setInterval(async () => {
    if (running) return; // never overlap two mirror cycles
    running = true;
    try {
      await run();
    } catch (err) {
      if (onError) onError(err);
    } finally {
      running = false;
    }
  }, intervalMs);

  if (typeof timer.unref === 'function') timer.unref();

  return () => clearInterval(timer);
}
