<script setup lang="ts">
import type { KanbanCard } from '../types/api.types';

defineProps<{ card: KanbanCard }>();
defineEmits<{ 'open-card': [card: KanbanCard] }>();

function priorityLabel(p: number) {
  return `P${p}`;
}
</script>

<template>
  <!-- Project card -->
  <div
    v-if="card.type === 'project'"
    class="kanban-card project-card"
    @click="$emit('open-card', card)"
  >
    <div class="card-header">
      <span class="type-badge project-badge">PROJECT</span>
    </div>
    <h4 class="card-title">{{ card.name }}</h4>
    <p class="card-description">{{ card.description }}</p>
    <ul class="story-checklist">
      <li
        v-for="s in card.stories"
        :key="s.id"
        class="checklist-item"
        :class="{ done: s.passes }"
      >
        <span class="check-icon">{{ s.passes ? '&#10003;' : '&#9675;' }}</span>
        <span class="checklist-title">{{ s.title }}</span>
      </li>
    </ul>
    <div class="card-footer">
      <span class="progress-text">{{ card.done }}/{{ card.total }}</span>
      <div class="mini-progress-track">
        <div class="mini-progress-fill" :style="{ width: card.percent + '%' }" />
      </div>
    </div>
  </div>

  <!-- Story card -->
  <div
    v-else
    class="kanban-card story-card"
    @click="$emit('open-card', card)"
  >
    <div class="card-header">
      <span class="type-badge story-badge">STORY</span>
      <div class="card-header-right">
        <span class="priority-badge" :data-priority="card.story.priority">
          {{ priorityLabel(card.story.priority) }}
        </span>
        <span v-if="card.story.notes" class="notes-indicator" title="Has notes">
          &#128221;
        </span>
      </div>
    </div>
    <h4 class="card-title">{{ card.story.title }}</h4>
    <p class="card-description">{{ card.story.description }}</p>
    <div class="card-footer">
      <span class="project-tag">{{ card.projectName }}</span>
      <span class="ac-count">
        {{ card.story.acceptanceCriteria.length }} AC
      </span>
    </div>
  </div>
</template>

<style scoped>
.kanban-card {
  background: var(--background-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--gap-md);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.kanban-card:hover {
  border-color: var(--border-hover);
  box-shadow: var(--shadow-sm);
}

.project-card {
  border-left: 3px solid var(--type-project);
}

.story-card {
  border-left: 3px solid var(--type-story);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--gap-sm);
}

.card-header-right {
  display: flex;
  align-items: center;
  gap: var(--gap-sm);
}

.type-badge {
  font-size: 0.625rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.project-badge {
  background: color-mix(in srgb, var(--type-project) 20%, transparent);
  color: var(--type-project);
}

.story-badge {
  background: color-mix(in srgb, var(--type-story) 20%, transparent);
  color: var(--type-story);
}

.priority-badge {
  font-size: var(--text-xs);
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.priority-badge[data-priority="1"] {
  background: color-mix(in srgb, var(--priority-1) 20%, transparent);
  color: var(--priority-1);
}

.priority-badge[data-priority="2"] {
  background: color-mix(in srgb, var(--priority-2) 20%, transparent);
  color: var(--priority-2);
}

.priority-badge[data-priority="3"] {
  background: color-mix(in srgb, var(--priority-3) 20%, transparent);
  color: var(--priority-3);
}

.notes-indicator {
  font-size: var(--text-sm);
}

.card-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--foreground);
  margin-bottom: var(--gap-xs);
  line-height: 1.4;
}

.card-description {
  font-size: var(--text-xs);
  color: var(--foreground-muted);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: var(--gap-sm);
}

.story-checklist {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: var(--gap-sm);
}

.checklist-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-xs);
  color: var(--foreground-muted);
  line-height: 1.4;
}

.checklist-item.done {
  color: var(--foreground-dim);
}

.checklist-item.done .checklist-title {
  text-decoration: line-through;
}

.check-icon {
  flex-shrink: 0;
  font-size: 0.625rem;
  width: 14px;
  text-align: center;
}

.checklist-item.done .check-icon {
  color: var(--status-success);
}

.checklist-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-sm);
}

.project-tag {
  font-size: 0.625rem;
  font-weight: 600;
  color: var(--type-project);
  background: color-mix(in srgb, var(--type-project) 12%, transparent);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
}

.ac-count {
  font-size: var(--text-xs);
  color: var(--foreground-dim);
  font-weight: 500;
  flex-shrink: 0;
}

.progress-text {
  font-size: var(--text-xs);
  color: var(--foreground-dim);
  font-weight: 500;
  font-family: var(--font-mono);
}

.mini-progress-track {
  flex: 1;
  height: 4px;
  background: var(--background-elevated);
  border-radius: 2px;
  overflow: hidden;
}

.mini-progress-fill {
  height: 100%;
  background: var(--type-project);
  border-radius: 2px;
  transition: width 0.3s ease;
}
</style>
