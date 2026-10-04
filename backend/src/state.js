import fsp from 'node:fs/promises';
import path from 'node:path';

const EMPTY_STATE = {
  title: 'Releases',
  favicon: null,
  lastUpdated: null,
  lastChecked: null,
  projects: [],
};

/**
 * Holds the current site state in memory and persists it to state.json so the
 * site is populated immediately after a restart, before the first GitHub poll.
 */
export function createStateStore(dataDir) {
  const stateFile = path.join(dataDir, 'state.json');
  let state = { ...EMPTY_STATE };

  return {
    get() {
      return state;
    },

    set(next) {
      state = next;
      return state;
    },

    async load() {
      try {
        const raw = await fsp.readFile(stateFile, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          state = { ...EMPTY_STATE, ...parsed };
        }
      } catch {
        // No usable state yet - the first mirror run will create it.
      }
      return state;
    },

    async save() {
      await fsp.mkdir(dataDir, { recursive: true });
      const tmp = `${stateFile}.part`;
      await fsp.writeFile(tmp, JSON.stringify(state, null, 2));
      await fsp.rename(tmp, stateFile);
      return state;
    },
  };
}
