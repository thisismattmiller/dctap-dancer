import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import HomeView from '@/views/HomeView.vue';
import WorkspaceView from '@/views/WorkspaceView.vue';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: HomeView
  },
  {
    path: '/workspace/:id',
    name: 'workspace',
    component: WorkspaceView,
    props: true
  },
  {
    path: '/workspace/:id/shape/:shapeId',
    name: 'shape',
    component: WorkspaceView,
    props: true
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router;
