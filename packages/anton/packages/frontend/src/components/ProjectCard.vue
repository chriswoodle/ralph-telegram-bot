<script setup lang="ts">
import { type Project, stateLabels, stateColors } from '../types';

const props = defineProps<{
  project: Project;
}>();
</script>

<template>
  <router-link :to="`/projects/${props.project.id}`" class="project-card">
    <div class="card-header">
      <span class="prefix">{{ props.project.prefix }}</span>
      <span
        class="state-badge"
        :style="{ backgroundColor: stateColors[props.project.state] }"
      >
        {{ stateLabels[props.project.state] }}
      </span>
    </div>
    <h3 class="card-title">{{ props.project.displayName }}</h3>
    <p class="card-description">{{ props.project.description || 'No description' }}</p>
    <div class="card-footer">
      <span class="internal-name">{{ props.project.internalName }}</span>
    </div>
  </router-link>
</template>

<style scoped>
.project-card {
  display: block;
  background: #1e1e2e;
  border: 1px solid #313244;
  border-radius: 12px;
  padding: 20px;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.2s, box-shadow 0.2s;
  cursor: pointer;
}

.project-card:hover {
  border-color: #585b70;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.prefix {
  font-size: 12px;
  font-weight: 700;
  color: #a6adc8;
  background: #313244;
  padding: 2px 8px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.state-badge {
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  padding: 3px 10px;
  border-radius: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.card-title {
  font-size: 18px;
  font-weight: 600;
  color: #cdd6f4;
  margin: 0 0 8px 0;
}

.card-description {
  font-size: 14px;
  color: #a6adc8;
  margin: 0 0 16px 0;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.internal-name {
  font-size: 12px;
  color: #6c7086;
  font-family: monospace;
}
</style>
