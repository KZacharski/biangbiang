<template>
  <div class="rm-page">
    <header class="rm-header">
      <div class="rm-header__inner">
        <div class="rm-brand">
          <img
            v-if="faviconUrl"
            :src="faviconUrl"
            class="rm-brand__icon"
            alt=""
            @error="faviconBroken = true"
          />
          <div class="rm-brand__text">
            <a-typography-title :level="4" class="rm-brand__title">{{ title }}</a-typography-title>
          </div>
        </div>

        <div class="rm-actions">
          <a-button size="small" :loading="refreshing" @click="onRefresh">
            <template #icon><reload-outlined /></template>
            {{ refreshing ? strings.refreshing : strings.refresh }}
          </a-button>
          <theme-switcher v-model:mode="mode" />
        </div>
      </div>
    </header>

    <main class="rm-content">
      <div v-if="loading && !hasLoadedOnce" class="rm-loading">
        <a-spin size="large" />
      </div>

      <a-result
        v-else-if="loadError"
        status="warning"
        :title="strings.loadErrorTitle"
        :sub-title="strings.loadErrorSubtitle"
      >
        <template #extra>
          <a-button type="primary" @click="load">{{ strings.retry }}</a-button>
        </template>
      </a-result>

      <a-empty v-else-if="projects.length === 0" :description="strings.noProjects" />

      <a-row v-else :gutter="[16, 16]">
        <a-col v-for="project in projects" :key="project.id" :xs="24" :sm="24" :md="12" :lg="8">
          <project-card :project="project" />
        </a-col>
      </a-row>
    </main>

    <footer class="rm-footer">
      <a-typography-text type="secondary">{{ strings.checkIntervalHint }}</a-typography-text>
      <a-typography-text type="secondary">
        {{ strings.updatedAt }}：{{ updatedText }}
      </a-typography-text>
      <div class="rm-footer__credit">
        <a :href="REPO_URL" target="_blank" rel="noopener noreferrer">
          <github-outlined />
          {{ strings.poweredBy(appVersion) }}
        </a>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { App } from 'ant-design-vue';
import { GithubOutlined, ReloadOutlined } from '@ant-design/icons-vue';

import ProjectCard from './ProjectCard.vue';
import ThemeSwitcher from './ThemeSwitcher.vue';
import { fetchState, formatDate, triggerRefresh, type Project, type SiteState } from '../api';
import { REPO_URL, strings } from '../strings';
import { useTheme } from '../theme';

const { message } = App.useApp();
const { mode } = useTheme();

// Injected by Vite from frontend/package.json.
const appVersion = __APP_VERSION__;

const state = ref<SiteState | null>(null);
const loading = ref(true);
const hasLoadedOnce = ref(false);
const loadError = ref(false);
const refreshing = ref(false);
const faviconBroken = ref(false);

const projects = computed<Project[]>(() => state.value?.projects ?? []);
const title = computed(() => state.value?.title || strings.appTitleFallback);
const faviconUrl = computed(() => (faviconBroken.value ? null : state.value?.favicon ?? null));
const updatedText = computed(() => formatDate(state.value?.lastUpdated ?? null) || strings.never);

async function load() {
  loading.value = true;
  try {
    state.value = await fetchState();
    loadError.value = false;
  } catch {
    if (!state.value) loadError.value = true;
  } finally {
    loading.value = false;
    hasLoadedOnce.value = true;
  }
}

async function onRefresh() {
  refreshing.value = true;
  try {
    await triggerRefresh();
    await load();
    message.success(strings.refreshed);
  } catch {
    message.error(strings.refreshFailed);
  } finally {
    refreshing.value = false;
  }
}

watch(
  title,
  (value) => {
    document.title = value;
  },
  { immediate: true },
);

watch(
  faviconUrl,
  (value) => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link && value) link.href = value;
  },
  { immediate: true },
);

let timer: number | undefined;

function onVisible() {
  if (document.visibilityState === 'visible') void load();
}

onMounted(() => {
  void load();
  // Keep the page current without a manual reload: poll periodically and
  // whenever the tab becomes visible again.
  timer = window.setInterval(() => void load(), 5 * 60 * 1000);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
});

onUnmounted(() => {
  if (timer) window.clearInterval(timer);
  document.removeEventListener('visibilitychange', onVisible);
  window.removeEventListener('focus', onVisible);
});
</script>

<style scoped>
.rm-loading {
  display: flex;
  justify-content: center;
  padding: 64px 0;
}
</style>
