import { computed, ref, watchEffect, type ComputedRef, type Ref } from 'vue';
import { theme as antdTheme } from 'ant-design-vue';

export type ThemeMode = 'auto' | 'light' | 'dark';

const STORAGE_KEY = 'biangbiang:theme';

/** Ant Design's Daybreak Blue - the accent until config.xml overrides it. */
export const DEFAULT_ACCENT = '#1677ff';

/**
 * The system font stack, used unless config.xml supplies a `<font>`. It lives
 * here rather than in styles.css because Ant Design needs the same value for its
 * `fontFamily` token, and Ant Design applies that token to every `ant-*` class -
 * so a body rule alone would leave all of its components on the old font.
 */
const SYSTEM_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, " +
  "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif";

/** Family name the injected `@font-face` is declared under. */
const CUSTOM_FONT_FAMILY = 'biangbiang-font';

/** id of the `<style>` element that holds the `@font-face` rule. */
const FONT_STYLE_ID = 'biangbiang-font-face';

/** `format()` hints browsers want for the file extensions we expect to see. */
const FONT_FORMATS: Record<string, string> = {
  woff2: 'woff2',
  woff: 'woff',
  ttf: 'truetype',
  otf: 'opentype',
};

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
const fontUrl = ref<string | null>(null);
const systemDark = ref(systemPrefersDark());

// The custom family is listed ahead of the system stack so the browser prefers
// it, and falls back per glyph for anything the font does not cover.
const fontStack = computed(() =>
  fontUrl.value ? `'${CUSTOM_FONT_FAMILY}', ${SYSTEM_FONT_STACK}` : SYSTEM_FONT_STACK,
);

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
    // Ant Design applies this to every `ant-*` class, so it is what makes the
    // custom font reach the components rather than just the page text.
    fontFamily: fontStack.value,
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
  // Same for the font: styles.css cannot know what config.xml asked for.
  document.documentElement.style.setProperty('--rm-font-family', fontStack.value);
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

/** Escape a value for use inside a single-quoted CSS string. */
function cssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[\r\n]/g, '');
}

/** Build the `@font-face` rule for one file. */
function fontFaceRule(url: string): string {
  const ext = (url.split(/[?#]/)[0].split('.').pop() || '').toLowerCase();
  const format = FONT_FORMATS[ext];
  const src = `url('${cssString(url)}')${format ? ` format('${format}')` : ''}`;
  return `@font-face{font-family:'${CUSTOM_FONT_FAMILY}';src:${src};font-display:swap;}`;
}

/** Create or drop the `<style>` element carrying the `@font-face` rule. */
function applyFontFace(url: string | null): void {
  if (typeof document === 'undefined') return;
  document.getElementById(FONT_STYLE_ID)?.remove();
  if (!url) return;

  const style = document.createElement('style');
  style.id = FONT_STYLE_ID;
  style.textContent = fontFaceRule(url);
  document.head.appendChild(style);
}

/**
 * Apply the font resolved from config.xml (`<font>`). Unlike the accent, a null
 * value is meaningful here: it is what the backend sends when the tag is absent
 * or the file is missing, and it puts the system stack back. Repeated calls with
 * the same URL are ignored so the periodic state poll cannot re-trigger a font
 * download.
 */
export function setFont(url: string | null | undefined): void {
  const next = url || null;
  if (next === fontUrl.value) return;
  fontUrl.value = next;
  applyFontFace(next);
}

export interface UseTheme {
  mode: Ref<ThemeMode>;
  isDark: ComputedRef<boolean>;
  themeConfig: ComputedRef<Record<string, unknown>>;
}

export function useTheme(): UseTheme {
  return { mode, isDark, themeConfig };
}
