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
          <a-select
            v-if="sortable"
            v-model:value="sortKey"
            class="rm-sort"
            size="small"
            :options="sortOptions"
            :aria-label="strings.sortLabel"
            :title="strings.sortLabel"
          />
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

      <div v-else class="rm-grid">
        <project-card v-for="project in projects" :key="project.id" :project="project" />
      </div>
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
import { setAccent, setFont, useTheme } from '../theme';

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

/** How the visitor ordered the cards. Only offered when `<sortable>` is on. */
type SortKey = 'name' | 'updated' | 'mostAssets' | 'leastAssets';

/** Alphabetical is the default the moment `<sortable>` is enabled. */
const sortKey = ref<SortKey>('name');

const sortOptions: { label: string; value: SortKey }[] = [
  { label: strings.sortByName, value: 'name' },
  { label: strings.sortByUpdated, value: 'updated' },
  { label: strings.sortByMostAssets, value: 'mostAssets' },
  { label: strings.sortByLeastAssets, value: 'leastAssets' },
];

/** Sortable timestamp; a missing or unusable date ranks below every real one. */
function timestamp(iso: string | null): number {
  if (!iso) return -1;
  const value = new Date(iso).getTime();
  return Number.isNaN(value) ? -1 : value;
}

/** A sorted copy of `list`. Items of equal rank keep their config.xml order. */
function sortProjects(list: Project[], key: SortKey): Project[] {
  const sorted = [...list];
  if (key === 'name') {
    return sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans'));
  }
  if (key === 'updated') {
    return sorted.sort((a, b) => timestamp(b.publishedAt) - timestamp(a.publishedAt));
  }
  const direction = key === 'mostAssets' ? -1 : 1;
  return sorted.sort((a, b) => direction * (a.assets.length - b.assets.length));
}

const sortable = computed(() => state.value?.sortable === true);

const projects = computed<Project[]>(() => {
  const list = state.value?.projects ?? [];
  // With `<sortable>false</sortable>` the cards keep the order of config.xml.
  return sortable.value ? sortProjects(list, sortKey.value) : list;
});

const title = computed(() => state.value?.title || strings.appTitleFallback);
const faviconUrl = computed(() => (faviconBroken.value ? null : state.value?.favicon ?? null));
const updatedText = computed(() => formatDate(state.value?.lastUpdated ?? null) || strings.never);

async function load() {
  loading.value = true;
  try {
    const next = await fetchState();
    state.value = next;
    // The accent and font live in config.xml, so they can change between polls.
    setAccent(next.accent);
    setFont(next.font);
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
