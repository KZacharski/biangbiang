import { zh_cn } from './zh_cn';
import { zh_tw } from './zh_tw';
import { en_us } from './en_us';
import { pl_pl } from './pl_pl';
import { ru_ru } from './ru_ru';
import { sv_se } from './sv_se';
import type { Locale, Messages } from './types';

export type { Locale, Messages } from './types';

/** The language used when config.xml has no usable `<lang>`. */
export const DEFAULT_LOCALE: Locale = 'zh_cn';

/** Every bundle, keyed by the code `<lang>` accepts. */
export const MESSAGES: Record<Locale, Messages> = { zh_cn, zh_tw, en_us, pl_pl, ru_ru, sv_se };

export interface LocaleInfo {
  /** The code config.xml `<lang>` uses. */
  code: Locale;
  /** The language's own name for itself. */
  name: string;
  /** English name, as used in the documentation. */
  englishName: string;
  /** BCP-47 tag for `<html lang>`, `Intl` and `toLocaleString`. */
  tag: string;
}

/**
 * The supported languages, in the order they are presented. The documentation
 * lists them in this same order - keep the two in step.
 */
export const LOCALES: LocaleInfo[] = [
  { code: 'zh_cn', name: '简体中文', englishName: 'Simplified Chinese', tag: 'zh-CN' },
  { code: 'zh_tw', name: '繁體中文', englishName: 'Traditional Chinese', tag: 'zh-TW' },
  { code: 'en_us', name: 'English', englishName: 'English', tag: 'en-US' },
  { code: 'pl_pl', name: 'Polski', englishName: 'Polish', tag: 'pl-PL' },
  { code: 'ru_ru', name: 'Русский', englishName: 'Russian', tag: 'ru-RU' },
  { code: 'sv_se', name: 'Svenska', englishName: 'Swedish', tag: 'sv-SE' },
];

/**
 * Narrow an arbitrary value to a supported locale code. `hasOwnProperty` rather
 * than `in`, so `<lang>constructor</lang>` is rejected instead of resolving to
 * an inherited key.
 */
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MESSAGES, value);
}

/** The BCP-47 tag for a locale code. */
export function tagFor(code: Locale): string {
  return LOCALES.find((entry) => entry.code === code)?.tag ?? 'zh-CN';
}
