<template>
  <a-card class="rm-card" :bordered="true">
    <div class="rm-card__head">
      <div class="rm-card__avatar">
        <img v-if="showIcon && project.icon" :src="project.icon" alt="" @error="showIcon = false" />
        <span v-else class="rm-card__avatar-fallback">{{ initial }}</span>
      </div>
      <div class="rm-card__meta">
        <a-typography-title
          :level="4"
          class="rm-card__name"
          :ellipsis="{ tooltip: project.name }"
        >
          {{ project.name }}
        </a-typography-title>
        <a-space :size="6" wrap>
          <a-tag v-if="project.version" color="processing">{{ project.version }}</a-tag>
          <a-tag v-else>{{ strings.noRelease }}</a-tag>
        </a-space>
      </div>
    </div>

    <div class="rm-card__body">
      <a-alert
        v-if="project.status === 'error'"
        type="error"
        show-icon
        :message="strings.syncError"
        :description="project.error || undefined"
      />

      <div v-else-if="project.assets.length" class="rm-card__assets">
        <a-button
          v-for="asset in project.assets"
          :key="asset.name"
          class="rm-card__asset-btn"
          :href="asset.url"
          :title="asset.name"
          download
        >
          <template #icon><download-outlined /></template>
          <span class="rm-card__asset-name">{{ asset.name }}</span>
          <span v-if="asset.size" class="rm-card__asset-size">({{ formatBytes(asset.size) }})</span>
        </a-button>
      </div>

      <a-empty v-else :image="simpleImage" :description="emptyText" />
    </div>

    <div v-if="hasFooter" class="rm-card__footer">
      <a-button
        v-if="project.repo"
        type="link"
        size="small"
        :href="project.repo"
        target="_blank"
        rel="noopener noreferrer"
      >
        <template #icon><github-outlined /></template>
        {{ strings.viewRepo }}
      </a-button>
      <span class="rm-card__dates">{{ dateText }}</span>
    </div>
  </a-card>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Empty } from 'ant-design-vue';
import { DownloadOutlined, GithubOutlined } from '@ant-design/icons-vue';

import { formatBytes, formatDate, type Project } from '../api';
import { strings } from '../strings';

const props = defineProps<{ project: Project }>();

const simpleImage = Empty.PRESENTED_IMAGE_SIMPLE;
const showIcon = ref(true);

const initial = computed(() => (props.project.name || '?').trim().charAt(0).toUpperCase() || '?');

const emptyText = computed(() =>
  props.project.status === 'empty' ? strings.noRelease : strings.noAssets,
);

const dateText = computed(() => {
  const formatted = formatDate(props.project.publishedAt);
  return formatted ? `${strings.releasedAt} ${formatted}` : '';
});

// The footer holds the repository link and the release date. A manual entry may
// have neither, in which case the whole row is dropped so it does not leave an
// empty divider strip behind.
const hasFooter = computed(() => Boolean(props.project.repo || dateText.value));
</script>
