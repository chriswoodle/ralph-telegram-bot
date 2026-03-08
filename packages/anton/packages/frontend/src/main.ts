import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'projects',
      component: () => import('./views/ProjectListView.vue'),
    },
    {
      path: '/projects/:id',
      name: 'project-detail',
      component: () => import('./views/ProjectDetailView.vue'),
    },
    {
      path: '/projects/:projectId/prds/:prdId',
      name: 'prd-authoring',
      component: () => import('./views/PrdAuthoringView.vue'),
    },
    {
      path: '/projects/:projectId/tasks/:taskSetId',
      name: 'task-building',
      component: () => import('./views/TaskBuildingView.vue'),
    },
  ],
})

const app = createApp(App)
app.use(router)
app.mount('#app')
