<script setup lang="ts">
import { ref, onMounted } from 'vue';
import ProjectCard from '../components/ProjectCard.vue';
import { api } from '../api/client';
import type { Project } from '../types';

const projects = ref<Project[]>([]);
const loading = ref(true);
const error = ref('');

const showDialog = ref(false);
const newName = ref('');
const newDescription = ref('');
const creating = ref(false);

async function fetchProjects() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.projectControllerList();
    projects.value = res.data as unknown as Project[];
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to load projects';
  } finally {
    loading.value = false;
  }
}

async function createProject() {
  if (!newName.value.trim()) return;
  creating.value = true;
  try {
    await api.projectControllerCreate({
      displayName: newName.value.trim(),
      description: newDescription.value.trim(),
    });
    showDialog.value = false;
    newName.value = '';
    newDescription.value = '';
    await fetchProjects();
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to create project';
  } finally {
    creating.value = false;
  }
}

function openDialog() {
  showDialog.value = true;
  newName.value = '';
  newDescription.value = '';
}

function closeDialog() {
  showDialog.value = false;
}

onMounted(fetchProjects);
</script>

<template>
  <div class="project-list-page">
    <header class="page-header">
      <div>
        <h1>Anton Projects</h1>
        <p class="subtitle">Manage your Ralph agent automation projects</p>
      </div>
      <button class="btn-primary" @click="openDialog">+ New Project</button>
    </header>

    <div v-if="loading" class="status-message">Loading projects...</div>
    <div v-else-if="error" class="status-message error">{{ error }}</div>
    <div v-else-if="projects.length === 0" class="empty-state">
      <p>No projects yet. Create your first project to get started.</p>
      <button class="btn-primary" @click="openDialog">+ New Project</button>
    </div>
    <div v-else class="project-grid">
      <ProjectCard
        v-for="project in projects"
        :key="project.id"
        :project="project"
      />
    </div>

    <!-- Create Project Dialog -->
    <div v-if="showDialog" class="dialog-overlay" @click.self="closeDialog">
      <div class="dialog">
        <h2>Create New Project</h2>
        <form @submit.prevent="createProject">
          <div class="form-group">
            <label for="project-name">Project Name</label>
            <input
              id="project-name"
              v-model="newName"
              type="text"
              placeholder="My Awesome Project"
              required
              autofocus
            />
          </div>
          <div class="form-group">
            <label for="project-description">Description</label>
            <textarea
              id="project-description"
              v-model="newDescription"
              placeholder="What does this project do?"
              rows="3"
            ></textarea>
          </div>
          <div class="dialog-actions">
            <button type="button" class="btn-secondary" @click="closeDialog">Cancel</button>
            <button type="submit" class="btn-primary" :disabled="creating || !newName.trim()">
              {{ creating ? 'Creating...' : 'Create Project' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.project-list-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px 24px;
  color: #cdd6f4;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 32px;
}

.page-header h1 {
  font-size: 28px;
  font-weight: 700;
  margin: 0;
  color: #cdd6f4;
}

.subtitle {
  font-size: 14px;
  color: #6c7086;
  margin: 4px 0 0 0;
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

.status-message {
  text-align: center;
  padding: 40px;
  color: #a6adc8;
  font-size: 16px;
}

.status-message.error {
  color: #f38ba8;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #a6adc8;
}

.empty-state p {
  font-size: 16px;
  margin-bottom: 20px;
}

.btn-primary {
  background: #89b4fa;
  color: #1e1e2e;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary:hover {
  background: #74c7ec;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: #313244;
  color: #cdd6f4;
  border: 1px solid #585b70;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-secondary:hover {
  background: #45475a;
}

.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.dialog {
  background: #1e1e2e;
  border: 1px solid #313244;
  border-radius: 16px;
  padding: 28px;
  width: 100%;
  max-width: 480px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.dialog h2 {
  margin: 0 0 24px 0;
  font-size: 20px;
  color: #cdd6f4;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #a6adc8;
  margin-bottom: 6px;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 10px 12px;
  background: #11111b;
  border: 1px solid #313244;
  border-radius: 8px;
  color: #cdd6f4;
  font-size: 14px;
  font-family: inherit;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #89b4fa;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}
</style>
