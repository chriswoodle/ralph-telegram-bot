<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import type { KanbanCard } from '../types/api.types';

defineProps<{ card: KanbanCard }>();
const emit = defineEmits<{ close: [] }>();

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onUnmounted(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="detail-modal">
      <!-- Project detail -->
      <template v-if="card.type === 'project'">
        <div class="modal-header">
          <span class="type-badge project-badge">PROJECT</span>
          <button class="close-btn" @click="$emit('close')">&times;</button>
        </div>

        <h2 class="modal-title">{{ card.name }}</h2>
        <p class="modal-description">{{ card.description }}</p>

        <div class="section">
          <h3 class="section-title">Progress &mdash; {{ card.done }}/{{ card.total }} ({{ card.percent }}%)</h3>
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: card.percent + '%' }" />
          </div>
        </div>

        <div class="section">
          <h3 class="section-title">User Stories</h3>
          <ul class="story-checklist">
            <li
              v-for="s in card.stories"
              :key="s.id"
              class="checklist-item"
              :class="{ done: s.passes }"
            >
              <span class="check-icon">{{ s.passes ? '&#10003;' : '&#9675;' }}</span>
              <span class="checklist-label">{{ s.title }}</span>
            </li>
          </ul>
        </div>

        <div class="modal-footer">
          <span
            class="status-pill"
            :class="card.percent === 100 ? 'done' : card.percent > 0 ? 'in-progress' : 'pending'"
          >
            {{ card.percent === 100 ? 'Complete' : card.percent > 0 ? 'In Progress' : 'Not Started' }}
          </span>
        </div>
      </template>

      <!-- Story detail -->
      <template v-else>
        <div class="modal-header">
          <div class="modal-header-badges">
            <span class="type-badge story-badge">STORY</span>
            <span class="priority-badge" :data-priority="card.story.priority">
              P{{ card.story.priority }}
            </span>
          </div>
          <button class="close-btn" @click="$emit('close')">&times;</button>
        </div>

        <div class="project-name-row">
          <span class="project-tag">{{ card.projectName }}</span>
        </div>

        <h2 class="modal-title">{{ card.story.title }}</h2>
        <p class="modal-description">{{ card.story.description }}</p>

        <div v-if="card.story.acceptanceCriteria.length" class="section">
          <h3 class="section-title">Acceptance Criteria</h3>
          <ul class="ac-list">
            <li v-for="(ac, i) in card.story.acceptanceCriteria" :key="i">
              {{ ac }}
            </li>
          </ul>
        </div>

        <div v-if="card.story.notes" class="section">
          <h3 class="section-title">Notes</h3>
          <p class="notes-text">{{ card.story.notes }}</p>
        </div>

        <div class="modal-footer">
          <span class="status-pill" :class="card.story.passes ? 'done' : 'pending'">
            {{ card.story.passes ? 'Done' : 'Pending' }}
          </span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.detail-modal {
  background: var(--background-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--gap-lg);
  width: 90%;
  max-width: 560px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: var(--shadow-lg);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--gap-md);
}

.modal-header-badges {
  display: flex;
  align-items: center;
  gap: var(--gap-sm);
}

.type-badge {
  font-size: 0.625rem;
  font-weight: 700;
  padding: 2px 8px;
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

.close-btn {
  background: none;
  border: none;
  color: var(--foreground-muted);
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.close-btn:hover {
  color: var(--foreground);
}

.project-name-row {
  margin-bottom: var(--gap-sm);
}

.project-tag {
  font-size: 0.625rem;
  font-weight: 600;
  color: var(--type-project);
  background: color-mix(in srgb, var(--type-project) 12%, transparent);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}

.modal-title {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--foreground);
  margin-bottom: var(--gap-sm);
}

.modal-description {
  font-size: var(--text-sm);
  color: var(--foreground-muted);
  line-height: 1.6;
  margin-bottom: var(--gap-lg);
}

.section {
  margin-bottom: var(--gap-lg);
}

.section-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--foreground);
  margin-bottom: var(--gap-sm);
}

.ac-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--gap-sm);
}

.ac-list li {
  font-size: var(--text-sm);
  color: var(--foreground-muted);
  padding-left: var(--gap-md);
  position: relative;
}

.ac-list li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
}

.notes-text {
  font-size: var(--text-sm);
  color: var(--foreground-muted);
  line-height: 1.6;
  white-space: pre-wrap;
}

.project-progress {
  display: flex;
  flex-direction: column;
  gap: var(--gap-sm);
}

.progress-stats {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.progress-stat {
  font-size: var(--text-sm);
  color: var(--foreground-muted);
}

.progress-percent {
  font-size: var(--text-sm);
  color: var(--foreground);
  font-weight: 600;
  font-family: var(--font-mono);
}

.progress-track {
  height: 6px;
  background: var(--background-elevated);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--type-project);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.story-checklist {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--gap-sm);
}

.checklist-item {
  display: flex;
  align-items: center;
  gap: var(--gap-sm);
  font-size: var(--text-sm);
  color: var(--foreground-muted);
}

.checklist-item.done {
  color: var(--foreground-dim);
}

.checklist-item.done .checklist-label {
  text-decoration: line-through;
}

.check-icon {
  flex-shrink: 0;
  font-size: var(--text-xs);
  width: 16px;
  text-align: center;
}

.checklist-item.done .check-icon {
  color: var(--status-success);
}

.checklist-label {
  line-height: 1.4;
}

.modal-footer {
  padding-top: var(--gap-md);
  border-top: 1px solid var(--border);
}

.status-pill {
  font-size: var(--text-xs);
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 999px;
}

.status-pill.done {
  background: color-mix(in srgb, var(--status-success) 20%, transparent);
  color: var(--status-success);
}

.status-pill.in-progress {
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  color: var(--accent);
}

.status-pill.pending {
  background: color-mix(in srgb, var(--foreground-dim) 20%, transparent);
  color: var(--foreground-dim);
}
</style>
