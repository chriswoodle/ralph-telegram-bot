<script setup lang="ts">
import { ref } from 'vue';
import { useApi } from '../composables/useApi';
import type { KanbanCard } from '../types/api.types';
import StatusBar from './StatusBar.vue';
import SessionList from './SessionList.vue';
import KanbanBoard from './KanbanBoard.vue';
import CardDetail from './CardDetail.vue';

const {
  status,
  sessions,
  projects,
  loading,
  error,
  columns,
} = useApi();

const expandedCard = ref<KanbanCard | null>(null);
</script>

<template>
  <div class="dashboard">
    <header class="dashboard-header">
      <div class="header-left">
        <h1 class="app-title">Ralph</h1>
        <span class="project-count" v-if="projects.length">
          {{ projects.length }} project{{ projects.length !== 1 ? 's' : '' }}
        </span>
      </div>
    </header>

    <StatusBar :status="status" :session="null" />

    <SessionList :sessions="sessions" />

    <div v-if="loading" class="loading-state">Loading...</div>
    <div v-else-if="error" class="error-state">{{ error }}</div>
    <div v-else-if="!projects.length" class="empty-state">
      No projects found. Start a project in Ralph to see it here.
    </div>

    <KanbanBoard
      v-if="projects.length"
      :columns="columns"
      @open-card="expandedCard = $event"
    />

    <CardDetail
      v-if="expandedCard"
      :card="expandedCard"
      @close="expandedCard = null"
    />
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: var(--gap-md);
  padding: var(--gap-lg);
  flex: 1;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--gap-md);
}

.header-left {
  display: flex;
  align-items: baseline;
  gap: var(--gap-md);
}

.app-title {
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--foreground);
}

.project-count {
  font-size: var(--text-sm);
  color: var(--foreground-muted);
}

.loading-state,
.error-state,
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 200px;
  font-size: var(--text-sm);
  color: var(--foreground-dim);
}

.error-state {
  color: var(--status-error);
}
</style>
