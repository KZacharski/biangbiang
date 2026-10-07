<template>
  <a-config-provider :locale="antdLocale" :theme="themeConfig">
    <a-app>
      <site-view />
    </a-app>
  </a-config-provider>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import enUS from 'ant-design-vue/es/locale/en_US';
import plPL from 'ant-design-vue/es/locale/pl_PL';
import ruRU from 'ant-design-vue/es/locale/ru_RU';
import svSE from 'ant-design-vue/es/locale/sv_SE';
import zhCN from 'ant-design-vue/es/locale/zh_CN';
import zhTW from 'ant-design-vue/es/locale/zh_TW';

import SiteView from './components/SiteView.vue';
import { locale } from './strings';
import { useTheme } from './theme';

const { themeConfig } = useTheme();

/**
 * Ant Design translates the components it renders itself - the empty state, the
 * select's "no data" text, and so on. Those translations are keyed by the same
 * language codes config.xml uses, so they follow `<lang>` without any extra
 * plumbing.
 */
const ANTD_LOCALES = {
  zh_cn: zhCN,
  zh_tw: zhTW,
  en_us: enUS,
  pl_pl: plPL,
  ru_ru: ruRU,
  sv_se: svSE,
};

const antdLocale = computed(() => ANTD_LOCALES[locale.value]);
</script>
