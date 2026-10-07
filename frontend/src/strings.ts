import { computed, reactive, ref } from 'vue';

import { DEFAULT_LOCALE, MESSAGES, isLocale, tagFor, type Locale } from './locales';

export { LOCALES } from './locales';
export type { Locale } from './locales';

/** The active language code, as config.xml `<lang>` spells it. */
export const locale = ref<Locale>(DEFAULT_LOCALE);

/**
 * The active language's interface text.
 *
 * This is one reactive object rather than a `computed`, which is what lets every
 * component keep reading `strings.someKey` directly - including from a template -
 * and still re-render when `setLocale` swaps the bundle underneath them. A
 * `computed` would have forced every call site to become `.value`.
 */
export const strings = reactive({ ...MESSAGES[DEFAULT_LOCALE] });

/** BCP-47 tag of the active language, for `Intl` and `localeCompare`. */
export const localeTag = computed(() => tagFor(locale.value));

/**
 * Switch the interface language to the code config.xml asked for. An
 * unrecognized code leaves the language alone, so a bad `<lang>` can never blank
 * the interface - it simply keeps Simplified Chinese.
 */
export function setLocale(code: string | null | undefined): void {
  if (!isLocale(code) || code === locale.value) return;
  locale.value = code;
  Object.assign(strings, MESSAGES[code]);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = tagFor(code);
  }
}

/** Home page of this project, linked from the footer. */
export const REPO_URL = 'https://github.com/xiaomianguan/biangbiang';
