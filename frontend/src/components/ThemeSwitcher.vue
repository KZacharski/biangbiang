<template>
  <a-segmented
    class="rm-theme-switcher"
    :value="mode"
    :options="options"
    size="small"
    :aria-label="strings.themeLabel"
    @change="onChange"
  />
</template>

<script setup lang="ts">
import { strings } from '../strings';
import type { ThemeMode } from '../theme';

defineProps<{ mode: ThemeMode }>();
const emit = defineEmits<{ (event: 'update:mode', value: ThemeMode): void }>();

const options = [
  { label: strings.themeAuto, value: 'auto' },
  { label: strings.themeLight, value: 'light' },
  { label: strings.themeDark, value: 'dark' },
];

function onChange(value: string | number) {
  const next = value as ThemeMode;
  if (next === 'auto' || next === 'light' || next === 'dark') {
    emit('update:mode', next);
  }
}
</script>

<style scoped>
.rm-theme-switcher {
  flex: 0 0 auto;
}
</style>
