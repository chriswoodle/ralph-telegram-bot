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
  ],
})

const app = createApp(App)
app.use(router)
app.mount('#app')
