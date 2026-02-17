<script setup lang="ts">
import type { ProjectSummary } from '../types/api.types';

defineProps<{
  projects: ProjectSummary[];
  modelValue: string | null;
}>();

defineEmits<{
  'update:modelValue': [value: string];
}>();
</script>

<template>
  <div v-if="projects?.length > 1" class="project-selector">
    <label class="selector-label">Project</label>
    <select
      class="selector-input"
      :value="modelValue"
      @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option
        v-for="project in projects"
        :key="project.name"
        :value="project.name"
      >
        {{ project.name }} ({{ project.percent }}%)
      </option>
    </select>
  </div>
</template>

<style scoped>
.project-selector {
  display: flex;
  align-items: center;
  gap: var(--gap-sm);
}

.selector-label {
  font-size: var(--text-xs);
  color: var(--foreground-dim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 500;
}

.selector-input {
  appearance: none;
  background: var(--background-elevated);
  color: var(--foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 6px 32px 6px 12px;
  font-size: var(--text-sm);
  font-family: inherit;
  cursor: pointer;
  outline: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}

.selector-input:hover {
  border-color: var(--border-hover);
}

.selector-input:focus {
  border-color: var(--accent);
}
</style>
