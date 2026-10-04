/**
 * One-shot CLI: run a single mirror cycle and exit.
 * Useful for cron-style scheduling outside the container or for testing.
 *
 *   node src/cli.js
 */
import { env, releasesDir } from './env.js';
import { createStateStore } from './state.js';
import { createMirror } from './mirror.js';

const store = createStateStore(env.dataDir);
await store.load();

const mirror = createMirror({
  configPath: env.configPath,
  releasesDir,
  store,
  concurrency: env.downloadConcurrency,
});

const state = await mirror.runOnce();
console.log(`[cli] done. ${state.projects.length} project(s).`);
for (const project of state.projects) {
  console.log(`  - ${project.id}: ${project.status} ${project.version || ''} (${project.assets.length} asset(s))`);
}
