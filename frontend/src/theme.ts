import { computed, ref, watchEffect, type ComputedRef, type Ref } from 'vue';
import { theme as antdTheme } from 'ant-design-vue';

export type ThemeMode = 'auto' | 'light' | 'dark';

const STORAGE_KEY = 'biangbiang:theme';

/** Ant Design's Daybreak Blue - the accent until config.xml overrides it. */
export const DEFAULT_ACCENT = '#1677ff';

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readStoredMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'auto' || saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* ignore */
  }
  return 'auto';
}

// --- shared singleton state (every caller observes the same theme) ----------

const mode = ref<ThemeMode>(readStoredMode());
const accent = ref(DEFAULT_ACCENT);
const systemDark = ref(systemPrefersDark());

if (typeof window !== 'undefined' && window.matchMedia) {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (event: MediaQueryListEvent) => {
    systemDark.value = event.matches;
  };
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', handler);
  } else if (typeof media.addListener === 'function') {
    media.addListener(handler);
  }
}

const isDark = computed(() => (mode.value === 'auto' ? systemDark.value : mode.value === 'dark'));

const themeConfig = computed(() => ({
  algorithm: isDark.value ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
  token: {
    // Ant Design keeps `colorInfo` (processing tags) and `colorLink` (link
    // buttons) on their own seeds, so they need pointing at the accent too or
    // they would stay Daybreak Blue while everything else changes.
    colorPrimary: accent.value,
    colorInfo: accent.value,
    colorLink: accent.value,
    borderRadius: 8,
  },
}));

// Reflect the resolved theme on <html> so global CSS and browser chrome match.
watchEffect(() => {
  if (typeof document === 'undefined') return;
  const dark = isDark.value;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  // The accent is configuration, not a preference, but styles.css needs it too.
  document.documentElement.style.setProperty('--rm-accent', accent.value);
  try {
    localStorage.setItem(STORAGE_KEY, mode.value);
  } catch {
    /* ignore */
  }
});

/**
 * Apply the accent colour resolved from config.xml (`<accent>`). Called with the
 * value from /api/state once it arrives; an empty value leaves blue in place.
 */
export function setAccent(color: string | null | undefined): void {
  if (color) accent.value = color;
}

export interface UseTheme {
  mode: Ref<ThemeMode>;
  isDark: ComputedRef<boolean>;
  themeConfig: ComputedRef<Record<string, unknown>>;
}

export function useTheme(): UseTheme {
  return { mode, isDark, themeConfig };
}
