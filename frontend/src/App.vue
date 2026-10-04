<template>
  <a-config-provider :locale="zhCN" :theme="themeConfig">
    <a-app>
      <site-view />
    </a-app>
  </a-config-provider>
</template>

<script setup lang="ts">
import zhCN from 'ant-design-vue/es/locale/zh_CN';

import SiteView from './components/SiteView.vue';
import { useTheme } from './theme';

const { themeConfig } = useTheme();
</script>
