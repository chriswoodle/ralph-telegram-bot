<script setup lang="ts">
import type { KanbanCard, StoryColumn } from '../types/api.types';
import StoryCard from './StoryCard.vue';

defineProps<{ column: StoryColumn }>();
defineEmits<{ 'open-card': [card: KanbanCard] }>();
</script>

<template>
  <div class="kanban-column" :class="{ accent: column.accent }">
    <div class="column-header">
      <h3 class="column-title">{{ column.title }}</h3>
      <span class="column-count">{{ column.cards.length }}</span>
    </div>
    <div class="column-body">
      <StoryCard
        v-for="card in column.cards"
        :key="card.type === 'project' ? card.id : card.story.id"
        :card="card"
        @open-card="$emit('open-card', card)"
      />
      <div v-if="column.cards.length === 0" class="empty-state">
        No items
      </div>
    </div>
  </div>
</template>

<style scoped>
.kanban-column {
  display: flex;
  flex-direction: column;
  background: var(--background-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  min-height: 200px;
  overflow: hidden;
}

.kanban-column.accent {
  border-top: 2px solid var(--accent);
}

.column-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--gap-md);
  border-bottom: 1px solid var(--border);
}

.column-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--foreground);
}

.column-count {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--foreground-muted);
  background: var(--background-card);
  padding: 2px 8px;
  border-radius: 999px;
}

.column-body {
  flex: 1;
  padding: var(--gap-sm);
  display: flex;
  flex-direction: column;
  gap: var(--gap-sm);
  overflow-y: auto;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 80px;
  color: var(--foreground-dim);
  font-size: var(--text-sm);
}
</style>
