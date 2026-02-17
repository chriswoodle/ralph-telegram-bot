<script setup lang="ts">
import type { KanbanCard, StoryColumn } from '../types/api.types';
import KanbanColumn from './KanbanColumn.vue';

defineProps<{ columns: StoryColumn[] }>();
defineEmits<{ 'open-card': [card: KanbanCard] }>();
</script>

<template>
  <div class="kanban-board">
    <KanbanColumn
      v-for="col in columns"
      :key="col.title"
      :column="col"
      @open-card="$emit('open-card', $event)"
    />
  </div>
</template>

<style scoped>
.kanban-board {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--gap-md);
  flex: 1;
  align-items: start;
}

@media (max-width: 768px) {
  .kanban-board {
    grid-template-columns: 1fr;
  }
}
</style>
