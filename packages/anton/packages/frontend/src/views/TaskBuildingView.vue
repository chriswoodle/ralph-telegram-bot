<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api/client';
import type { TaskSetEntry, UserStory } from '../types';

const route = useRoute();
const router = useRouter();

const projectId = computed(() => route.params.projectId as string);
const taskSetId = computed(() => route.params.taskSetId as string);

const taskSet = ref<TaskSetEntry | null>(null);
const loading = ref(true);
const error = ref('');
const processing = ref(false);

// Delete confirmation
const deleteConfirmId = ref<string | null>(null);

// Edit state
const editingStoryId = ref<string | null>(null);
const editPrompt = ref('');

async function fetchTaskSet() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.taskControllerGetTaskSet(projectId.value, taskSetId.value);
    taskSet.value = res.data as unknown as TaskSetEntry;
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to load task set';
  } finally {
    loading.value = false;
  }
}

async function deleteStory(storyId: string) {
  processing.value = true;
  error.value = '';
  try {
    await api.taskControllerDeleteStory(projectId.value, taskSetId.value, storyId);
    deleteConfirmId.value = null;
    await fetchTaskSet();
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to delete story';
  } finally {
    processing.value = false;
  }
}

async function submitEdit(storyId: string) {
  if (!editPrompt.value.trim()) return;
  processing.value = true;
  error.value = '';
  try {
    await api.taskControllerEditStory(projectId.value, taskSetId.value, storyId, {
      editPrompt: editPrompt.value,
    });
    editingStoryId.value = null;
    editPrompt.value = '';
    await fetchTaskSet();
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to edit story';
  } finally {
    processing.value = false;
  }
}

function startEdit(story: UserStory) {
  editingStoryId.value = story.id;
  editPrompt.value = '';
  deleteConfirmId.value = null;
}

function cancelEdit() {
  editingStoryId.value = null;
  editPrompt.value = '';
}

function confirmDelete(storyId: string) {
  deleteConfirmId.value = storyId;
  editingStoryId.value = null;
}

function cancelDelete() {
  deleteConfirmId.value = null;
}

onMounted(fetchTaskSet);
</script>

<template>
  <div class="task-building">
    <header class="top-bar">
      <button class="back-btn" @click="router.push({ name: 'project-detail', params: { id: projectId } })">
        &larr; Back
      </button>
      <h1>Task Building</h1>
      <span v-if="taskSet" class="story-count">
        {{ taskSet.userStories.length }} stories
      </span>
    </header>

    <div v-if="loading" class="loading">Loading tasks...</div>
    <div v-else-if="error" class="error-msg">{{ error }}</div>

    <template v-if="taskSet && !loading">
      <div class="stories-summary-bar">
        <span class="summary-total">{{ taskSet.userStories.length }} total</span>
        <span class="summary-passing">{{ taskSet.userStories.filter(s => s.passes).length }} passing</span>
        <span class="summary-remaining">{{ taskSet.userStories.filter(s => !s.passes).length }} remaining</span>
      </div>

      <div class="stories-list">
        <div
          v-for="story in taskSet.userStories"
          :key="story.id"
          class="story-card"
          :class="{ passing: story.passes }"
        >
          <div class="story-header">
            <span class="story-id">{{ story.id }}</span>
            <span class="priority-badge">P{{ story.priority }}</span>
            <span class="status-badge" :class="story.passes ? 'status-pass' : 'status-pending'">
              {{ story.passes ? 'Passing' : 'Pending' }}
            </span>
            <div class="story-actions">
              <button
                class="action-btn edit-btn"
                :disabled="processing"
                @click="startEdit(story)"
                title="Edit story"
              >Edit</button>
              <button
                class="action-btn delete-btn"
                :disabled="processing"
                @click="confirmDelete(story.id)"
                title="Delete story"
              >Delete</button>
            </div>
          </div>

          <h3 class="story-title">{{ story.title }}</h3>
          <p class="story-description">{{ story.description }}</p>

          <div class="acceptance-criteria">
            <h4>Acceptance Criteria</h4>
            <ul>
              <li v-for="(criterion, idx) in story.acceptanceCriteria" :key="idx">
                {{ criterion }}
              </li>
            </ul>
          </div>

          <p v-if="story.notes" class="story-notes">
            <strong>Notes:</strong> {{ story.notes }}
          </p>

          <!-- Delete confirmation -->
          <div v-if="deleteConfirmId === story.id" class="confirm-bar">
            <span class="confirm-text">Delete this story? IDs will be re-numbered.</span>
            <button
              class="btn btn-danger btn-sm"
              :disabled="processing"
              @click="deleteStory(story.id)"
            >{{ processing ? 'Deleting...' : 'Confirm Delete' }}</button>
            <button
              class="btn btn-secondary btn-sm"
              :disabled="processing"
              @click="cancelDelete()"
            >Cancel</button>
          </div>

          <!-- Edit prompt -->
          <div v-if="editingStoryId === story.id" class="edit-section">
            <h4>Edit via Prompt</h4>
            <textarea
              v-model="editPrompt"
              class="edit-input"
              placeholder="Describe the changes you want to make to this story..."
              rows="3"
            ></textarea>
            <div class="edit-actions">
              <button
                class="btn btn-primary btn-sm"
                :disabled="!editPrompt.trim() || processing"
                @click="submitEdit(story.id)"
              >{{ processing ? 'Editing...' : 'Submit Edit' }}</button>
              <button
                class="btn btn-secondary btn-sm"
                :disabled="processing"
                @click="cancelEdit()"
              >Cancel</button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.task-building {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem;
  color: #cdd6f4;
}

.top-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.top-bar h1 {
  margin: 0;
  font-size: 1.5rem;
  flex: 1;
}

.back-btn {
  background: #313244;
  color: #cdd6f4;
  border: 1px solid #45475a;
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
}

.back-btn:hover {
  background: #45475a;
}

.story-count {
  color: #a6adc8;
  font-size: 0.9rem;
}

.loading {
  text-align: center;
  padding: 3rem;
  color: #a6adc8;
}

.error-msg {
  background: rgba(243, 139, 168, 0.15);
  border: 1px solid #f38ba8;
  color: #f38ba8;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
}

/* Summary bar */
.stories-summary-bar {
  display: flex;
  gap: 1.5rem;
  padding: 0.75rem 1rem;
  background: #1e1e2e;
  border: 1px solid #313244;
  border-radius: 8px;
  margin-bottom: 1.5rem;
  font-size: 0.9rem;
}

.summary-total {
  color: #cdd6f4;
  font-weight: 600;
}

.summary-passing {
  color: #a6e3a1;
}

.summary-remaining {
  color: #f9e2af;
}

/* Story cards */
.stories-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.story-card {
  background: #1e1e2e;
  border: 1px solid #313244;
  border-radius: 10px;
  padding: 1.25rem;
  transition: border-color 0.15s;
}

.story-card:hover {
  border-color: #45475a;
}

.story-card.passing {
  border-left: 3px solid #a6e3a1;
}

.story-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.story-id {
  background: #313244;
  color: #cdd6f4;
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 700;
  font-family: 'Fira Code', 'JetBrains Mono', monospace;
}

.priority-badge {
  background: #45475a;
  color: #a6adc8;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}

.status-badge {
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 0.7rem;
  font-weight: 600;
}

.status-pass {
  background: rgba(166, 227, 161, 0.15);
  color: #a6e3a1;
}

.status-pending {
  background: rgba(249, 226, 175, 0.15);
  color: #f9e2af;
}

.story-actions {
  margin-left: auto;
  display: flex;
  gap: 0.5rem;
}

.action-btn {
  padding: 0.25rem 0.6rem;
  border-radius: 6px;
  border: 1px solid #45475a;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.edit-btn {
  background: #313244;
  color: #89b4fa;
  border-color: #89b4fa40;
}

.edit-btn:not(:disabled):hover {
  background: rgba(137, 180, 250, 0.15);
}

.delete-btn {
  background: #313244;
  color: #f38ba8;
  border-color: #f38ba840;
}

.delete-btn:not(:disabled):hover {
  background: rgba(243, 139, 168, 0.15);
}

.story-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 0.5rem;
  color: #cdd6f4;
}

.story-description {
  color: #a6adc8;
  font-size: 0.9rem;
  margin: 0 0 0.75rem;
  line-height: 1.5;
}

.acceptance-criteria {
  background: #11111b;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  border: 1px solid #45475a;
}

.acceptance-criteria h4 {
  margin: 0 0 0.5rem;
  font-size: 0.8rem;
  color: #6c7086;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.acceptance-criteria ul {
  margin: 0;
  padding-left: 1.25rem;
}

.acceptance-criteria li {
  font-size: 0.85rem;
  color: #a6adc8;
  margin: 0.25rem 0;
  line-height: 1.4;
}

.story-notes {
  margin: 0.75rem 0 0;
  font-size: 0.85rem;
  color: #6c7086;
}

/* Delete confirmation */
.confirm-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 1rem;
  padding: 0.75rem;
  background: rgba(243, 139, 168, 0.08);
  border: 1px solid #f38ba840;
  border-radius: 8px;
}

.confirm-text {
  font-size: 0.85rem;
  color: #f38ba8;
  flex: 1;
}

/* Edit section */
.edit-section {
  margin-top: 1rem;
  padding: 1rem;
  background: rgba(137, 180, 250, 0.05);
  border: 1px solid #89b4fa40;
  border-radius: 8px;
}

.edit-section h4 {
  margin: 0 0 0.5rem;
  font-size: 0.9rem;
  color: #89b4fa;
}

.edit-input {
  width: 100%;
  background: #11111b;
  color: #cdd6f4;
  border: 1px solid #45475a;
  border-radius: 6px;
  padding: 0.75rem;
  font-family: inherit;
  font-size: 0.9rem;
  resize: vertical;
  margin-bottom: 0.75rem;
}

.edit-input:focus {
  outline: none;
  border-color: #89b4fa;
}

.edit-actions {
  display: flex;
  gap: 0.5rem;
}

/* Buttons */
.btn {
  padding: 0.5rem 1.25rem;
  border-radius: 8px;
  border: none;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-sm {
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
}

.btn-primary {
  background: #89b4fa;
  color: #11111b;
}

.btn-secondary {
  background: #45475a;
  color: #cdd6f4;
}

.btn-danger {
  background: #f38ba8;
  color: #11111b;
}

.btn:not(:disabled):hover {
  opacity: 0.85;
}
</style>
