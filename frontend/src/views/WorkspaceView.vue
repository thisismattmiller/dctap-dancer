<template>
  <div class="workspace-view">
    <!-- Header -->
    <header class="workspace-header">
      <div class="header-left">
        <button class="btn btn-icon" @click="goHome" title="Back to Home">
          &larr;
        </button>
        <h1>
          <span v-if="workspace?.isLocked" class="lock-icon" title="This workspace is locked (read-only)">&#128274;</span>
          {{ workspace?.name || 'Loading...' }}
        </h1>
        <span v-if="workspace?.isLocked" class="locked-badge">Read-only</span>
      </div>
      <div class="header-right">
        <button class="btn btn-secondary" @click="showOptionsDialog = true">
          Options
        </button>
        <button class="btn btn-secondary" @click="showNamespaceManager = true">
          Namespaces
        </button>
        <button class="btn btn-secondary" @click="exportWorkspace('csv')">
          Export CSV
        </button>
        <button class="btn btn-secondary" @click="exportWorkspace('tsv')">
          Export TSV
        </button>
        <button v-if="workspaceOptions.useLCColumns" class="btn btn-secondary" @click="exportMarvaProfile">
          Export Marva Profile JSON
        </button>
      </div>
    </header>

    <div class="workspace-content">
      <!-- Sidebar -->
      <aside class="sidebar" :class="{ collapsed: sidebarCollapsed }">
        <div class="sidebar-header">
          <h2>Shapes</h2>
          <button class="btn btn-icon" @click="sidebarCollapsed = !sidebarCollapsed">
            {{ sidebarCollapsed ? '&raquo;' : '&laquo;' }}
          </button>
        </div>
        <div v-if="!sidebarCollapsed" class="sidebar-content">
          <div class="sidebar-buttons">
            <button
              class="btn btn-primary btn-grow"
              @click="showNewShapeDialog = true"
              :disabled="workspace?.isLocked"
              :title="workspace?.isLocked ? 'Cannot modify a locked workspace' : ''"
            >
              + Shape
            </button>
            <button
              class="btn btn-secondary btn-grow"
              @click="showNewFolderDialog = true"
              :disabled="workspace?.isLocked"
              :title="workspace?.isLocked ? 'Cannot modify a locked workspace' : ''"
            >
              + Folder
            </button>
          </div>

          <!-- Root shapes drop zone -->
          <div
            class="root-drop-zone"
            :class="{ 'drag-over': dragOverFolderId === 'root' }"
            @dragover="handleFolderDragOver(null, $event)"
            @dragleave="handleFolderDragLeave"
            @drop="handleFolderDrop(null, $event)"
          >
            <div class="shape-list">
              <div
                v-for="shape in rootShapes"
                :key="shape.shapeId"
                class="shape-item"
                :class="{ active: currentShapeId === shape.shapeId, dragging: draggedShapeId === shape.shapeId }"
                draggable="true"
                @click="selectShape(shape.shapeId)"
                @dragstart="handleShapeDragStart(shape.shapeId, $event)"
                @dragend="handleShapeDragEnd"
              >
                <span class="shape-name">{{ shape.shapeId }}</span>
                <span v-if="shape.shapeLabel" class="shape-label">{{ shape.shapeLabel }}</span>
                <div v-if="!workspace?.isLocked" class="shape-actions">
                  <button class="btn btn-icon btn-small" @click.stop="editShape(shape)" title="Rename">
                    &#9998;
                  </button>
                  <button class="btn btn-icon btn-small btn-danger" @click.stop="confirmDeleteShape(shape)" title="Delete">
                    &times;
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Folders -->
          <div class="folder-list">
            <div
              v-for="folder in sortedFolders"
              :key="folder.id"
              class="folder-container"
            >
              <div
                class="folder-header"
                :class="{ 'drag-over': dragOverFolderId === folder.id }"
                @click="toggleFolder(folder.id)"
                @dragover="handleFolderDragOver(folder.id, $event)"
                @dragleave="handleFolderDragLeave"
                @drop="handleFolderDrop(folder.id, $event)"
              >
                <span class="folder-toggle">{{ isFolderCollapsed(folder.id) ? '▶' : '▼' }}</span>
                <span class="folder-icon">📁</span>
                <span class="folder-name">{{ folder.name }}</span>
                <span class="folder-count">({{ shapesByFolder.get(folder.id)?.length || 0 }})</span>
                <div v-if="!workspace?.isLocked" class="folder-actions">
                  <button class="btn btn-icon btn-small btn-danger" @click.stop="deleteFolder(folder)" title="Delete folder">
                    &times;
                  </button>
                </div>
              </div>
              <div v-if="!isFolderCollapsed(folder.id)" class="folder-shapes">
                <div
                  v-for="shape in shapesByFolder.get(folder.id) || []"
                  :key="shape.shapeId"
                  class="shape-item"
                  :class="{ active: currentShapeId === shape.shapeId, dragging: draggedShapeId === shape.shapeId }"
                  draggable="true"
                  @click="selectShape(shape.shapeId)"
                  @dragstart="handleShapeDragStart(shape.shapeId, $event)"
                  @dragend="handleShapeDragEnd"
                >
                  <span class="shape-name">{{ shape.shapeId }}</span>
                  <span v-if="shape.shapeLabel" class="shape-label">{{ shape.shapeLabel }}</span>
                  <div v-if="!workspace?.isLocked" class="shape-actions">
                    <button class="btn btn-icon btn-small" @click.stop="editShape(shape)" title="Rename">
                      &#9998;
                    </button>
                    <button class="btn btn-icon btn-small btn-danger" @click.stop="confirmDeleteShape(shape)" title="Delete">
                      &times;
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <!-- Main Content -->
      <main class="main-content">
        <div v-if="loading" class="loading">Loading...</div>
        <div v-else-if="error" class="error">{{ error }}</div>
        <div v-else-if="!currentShapeId" class="empty">
          <p>No shapes yet. Create a new shape to get started.</p>
        </div>
        <SpreadsheetGrid
          v-else
          :workspace-id="id"
          :shape-id="currentShapeId"
          :shapes="shapes"
          :namespaces="namespaces"
          :shape-label="currentShape?.shapeLabel || ''"
          :description="currentShape?.description || ''"
          :resource-u-r-i="currentShape?.resourceURI || ''"
          :use-l-c-columns="workspaceOptions.useLCColumns"
          :is-locked="workspace?.isLocked || false"
          @shape-label-change="updateShapeLabel"
          @description-change="updateDescription"
          @resource-uri-change="updateResourceURI"
        />
      </main>
    </div>

    <!-- New Shape Dialog -->
    <div v-if="showNewShapeDialog" class="dialog-overlay" @click.self="showNewShapeDialog = false">
      <div class="dialog">
        <h2>New Shape</h2>
        <form @submit.prevent="createShape">
          <div class="form-group">
            <label for="shapeId">Shape ID</label>
            <input
              id="shapeId"
              ref="newShapeIdInput"
              v-model="newShapeId"
              type="text"
              placeholder="e.g., Book, Person, Organization"
              required
            />
          </div>
          <div class="form-group">
            <label for="shapeLabel">Shape Label (optional)</label>
            <input
              id="shapeLabel"
              v-model="newShapeLabel"
              type="text"
              placeholder="Human-readable name"
            />
          </div>
          <div class="dialog-actions">
            <button type="button" class="btn btn-secondary" @click="showNewShapeDialog = false">
              Cancel
            </button>
            <button type="submit" class="btn btn-primary" :disabled="!newShapeId.trim()">
              Create
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Edit Shape Dialog -->
    <div v-if="showEditShapeDialog" class="dialog-overlay" @click.self="showEditShapeDialog = false">
      <div class="dialog">
        <h2>Edit Shape</h2>
        <form @submit.prevent="doEditShape">
          <div class="form-group">
            <label for="editShapeId">Shape ID</label>
            <input
              id="editShapeId"
              v-model="editShapeData.shapeId"
              type="text"
              required
            />
          </div>
          <div class="form-group">
            <label for="editShapeLabel">Shape Label</label>
            <input
              id="editShapeLabel"
              v-model="editShapeData.shapeLabel"
              type="text"
            />
          </div>
          <div class="dialog-actions">
            <button type="button" class="btn btn-secondary" @click="showEditShapeDialog = false">
              Cancel
            </button>
            <button type="submit" class="btn btn-primary">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete Shape Confirmation -->
    <div v-if="showDeleteShapeDialog" class="dialog-overlay" @click.self="showDeleteShapeDialog = false">
      <div class="dialog">
        <h2>Delete Shape</h2>
        <p v-if="shapeUsages.length > 0" class="warning">
          Cannot delete this shape. It is referenced by: {{ shapeUsages.join(', ') }}
        </p>
        <p v-else>
          Are you sure you want to delete "{{ shapeToDelete?.shapeId }}"? This will delete all rows in this shape.
        </p>
        <div class="dialog-actions">
          <button class="btn btn-secondary" @click="showDeleteShapeDialog = false">
            Cancel
          </button>
          <button
            v-if="shapeUsages.length === 0"
            class="btn btn-danger"
            @click="doDeleteShape"
          >
            Delete
          </button>
        </div>
      </div>
    </div>

    <!-- New Folder Dialog -->
    <div v-if="showNewFolderDialog" class="dialog-overlay" @click.self="showNewFolderDialog = false">
      <div class="dialog">
        <h2>New Folder</h2>
        <form @submit.prevent="createFolder">
          <div class="form-group">
            <label for="folderName">Folder Name</label>
            <input
              id="folderName"
              ref="newFolderNameInput"
              v-model="newFolderName"
              type="text"
              placeholder="e.g., Core Shapes, Examples"
              required
            />
          </div>
          <div class="dialog-actions">
            <button type="button" class="btn btn-secondary" @click="showNewFolderDialog = false">
              Cancel
            </button>
            <button type="submit" class="btn btn-primary" :disabled="!newFolderName.trim()">
              Create
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Namespace Manager -->
    <NamespaceManager
      v-if="showNamespaceManager"
      :workspace-id="id"
      :namespaces="namespaces"
      @close="showNamespaceManager = false"
      @update="loadNamespaces"
    />

    <!-- Options Dialog -->
    <div v-if="showOptionsDialog" class="dialog-overlay" @click.self="showOptionsDialog = false">
      <div class="dialog options-dialog">
        <h2>Workspace Options</h2>
        <div class="option-item">
          <label class="option-label">
            <input
              type="checkbox"
              :checked="workspaceOptions.useLCColumns"
              @change="toggleLCColumns"
            />
            <span class="option-text">Use LC Columns</span>
          </label>
          <p class="option-description">
            Adds columns to the table that are used specifically by Library of Congress (Resource URI, LC dataTypeURI).
          </p>
        </div>
        <div v-if="workspaceOptions.useLCColumns" class="option-item">
          <div class="option-header">
            <span class="option-text">LC Starting Point Import</span>
          </div>
          <p class="option-description">
            Import an LC Starting Point JSON file to create starting point shapes in this workspace.
          </p>
          <input
            type="file"
            ref="startingPointFileInput"
            accept=".json"
            style="display: none"
            @change="handleStartingPointFileSelect"
          />
          <button
            class="btn btn-secondary btn-small-margin"
            @click="triggerStartingPointImport"
            :disabled="importingStartingPoints || workspace?.isLocked"
            :title="workspace?.isLocked ? 'Cannot import to a locked workspace' : ''"
          >
            {{ importingStartingPoints ? 'Importing...' : 'Import Starting Point File' }}
          </button>
        </div>
        <div class="dialog-actions">
          <button class="btn btn-secondary" @click="showOptionsDialog = false">
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { workspaceApi, shapeApi, namespaceApi, folderApi, importExportApi, marvaProfileApi, startingPointApi } from '@/services/api';
import type { Workspace, Shape, Namespace, Folder, WorkspaceOptions } from '@/types';
import SpreadsheetGrid from '@/components/spreadsheet/SpreadsheetGrid.vue';
import NamespaceManager from '@/components/NamespaceManager.vue';

export default defineComponent({
  name: 'WorkspaceView',
  components: {
    SpreadsheetGrid,
    NamespaceManager
  },
  props: {
    id: {
      type: String,
      required: true
    },
    shapeId: {
      type: String,
      default: null
    }
  },
  setup(props) {
    const router = useRouter();
    const route = useRoute();

    const workspace = ref<Workspace | null>(null);
    const shapes = ref<Shape[]>([]);
    const folders = ref<Folder[]>([]);
    const namespaces = ref<Namespace[]>([]);
    const currentShapeId = ref<string | null>(null);
    const loading = ref(true);
    const error = ref<string | null>(null);
    const sidebarCollapsed = ref(false);

    // Folder expand state - folders are collapsed by default
    const expandedFolders = ref<Set<number>>(new Set());

    // Drag and drop
    const draggedShapeId = ref<string | null>(null);
    const dragOverFolderId = ref<number | null | 'root'>(null);

    // Polling
    let pollInterval: number | null = null;
    const lastUpdatedAt = ref<number>(0);

    // Dialogs
    const showNewShapeDialog = ref(false);
    const newShapeId = ref('');
    const newShapeLabel = ref('');
    const newShapeIdInput = ref<HTMLInputElement | null>(null);

    const showNewFolderDialog = ref(false);
    const newFolderName = ref('');
    const newFolderNameInput = ref<HTMLInputElement | null>(null);

    const showEditShapeDialog = ref(false);
    const editShapeData = ref({ originalId: '', shapeId: '', shapeLabel: '' });

    const showDeleteShapeDialog = ref(false);
    const shapeToDelete = ref<Shape | null>(null);
    const shapeUsages = ref<string[]>([]);

    const showNamespaceManager = ref(false);
    const showOptionsDialog = ref(false);
    const workspaceOptions = ref<WorkspaceOptions>({ useLCColumns: false });

    // Starting point import
    const startingPointFileInput = ref<HTMLInputElement | null>(null);
    const importingStartingPoints = ref(false);

    // Shapes at root level (no folder)
    const rootShapes = computed(() => {
      return [...shapes.value]
        .filter(s => s.folderId === null)
        .sort((a, b) => a.shapeId.localeCompare(b.shapeId));
    });

    // Shapes grouped by folder
    const shapesByFolder = computed(() => {
      const map = new Map<number, Shape[]>();
      for (const shape of shapes.value) {
        if (shape.folderId !== null) {
          if (!map.has(shape.folderId)) {
            map.set(shape.folderId, []);
          }
          map.get(shape.folderId)!.push(shape);
        }
      }
      // Sort shapes within each folder
      for (const [folderId, folderShapes] of map) {
        map.set(folderId, folderShapes.sort((a, b) => a.shapeId.localeCompare(b.shapeId)));
      }
      return map;
    });

    // Sorted folders
    const sortedFolders = computed(() => {
      return [...folders.value].sort((a, b) => a.name.localeCompare(b.name));
    });

    const sortedShapes = computed(() => {
      return [...shapes.value].sort((a, b) => a.shapeId.localeCompare(b.shapeId));
    });

    const currentShape = computed(() => {
      return shapes.value.find(s => s.shapeId === currentShapeId.value) || null;
    });

    async function loadWorkspace() {
      loading.value = true;
      error.value = null;
      try {
        workspace.value = await workspaceApi.get(props.id);
        await Promise.all([loadShapes(), loadFolders(), loadNamespaces(), loadOptions()]);
        lastUpdatedAt.value = workspace.value.updatedAt;
      } catch (e) {
        error.value = (e as Error).message;
      } finally {
        loading.value = false;
      }
    }

    async function loadFolders() {
      folders.value = await folderApi.list(props.id);
    }

    async function loadShapes() {
      shapes.value = await shapeApi.list(props.id);
      // Set initial shape if not set
      if (!currentShapeId.value && shapes.value.length > 0) {
        currentShapeId.value = props.shapeId || shapes.value[0].shapeId;
      }
    }

    async function loadNamespaces() {
      namespaces.value = await namespaceApi.list(props.id);
    }

    async function loadOptions() {
      workspaceOptions.value = await workspaceApi.getOptions(props.id);
    }

    async function toggleLCColumns() {
      const newValue = !workspaceOptions.value.useLCColumns;
      workspaceOptions.value = await workspaceApi.updateOptions(props.id, { useLCColumns: newValue });
    }

    async function pollForUpdates() {
      try {
        const updatedAt = await workspaceApi.getUpdatedAt(props.id);
        if (updatedAt > lastUpdatedAt.value) {
          lastUpdatedAt.value = updatedAt;
          await loadShapes();
          // Note: The SpreadsheetGrid will handle its own data refresh
        }
      } catch {
        // Ignore polling errors
      }
    }

    function startPolling() {
      pollInterval = window.setInterval(pollForUpdates, 5000);
    }

    function stopPolling() {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    }

    function goHome() {
      router.push({ name: 'home' });
    }

    function selectShape(shapeId: string) {
      currentShapeId.value = shapeId;
      router.replace({ name: 'shape', params: { id: props.id, shapeId } });
    }

    async function createShape() {
      if (!newShapeId.value.trim()) return;
      try {
        const shape = await shapeApi.create(props.id, newShapeId.value.trim(), newShapeLabel.value.trim() || undefined);
        showNewShapeDialog.value = false;
        newShapeId.value = '';
        newShapeLabel.value = '';
        await loadShapes();
        selectShape(shape.shapeId);
      } catch (e) {
        alert((e as Error).message);
      }
    }

    function editShape(shape: Shape) {
      editShapeData.value = {
        originalId: shape.shapeId,
        shapeId: shape.shapeId,
        shapeLabel: shape.shapeLabel || ''
      };
      showEditShapeDialog.value = true;
    }

    async function doEditShape() {
      try {
        await shapeApi.update(props.id, editShapeData.value.originalId, {
          shapeId: editShapeData.value.shapeId,
          shapeLabel: editShapeData.value.shapeLabel
        });
        showEditShapeDialog.value = false;

        // Update current shape ID if it changed
        if (currentShapeId.value === editShapeData.value.originalId) {
          currentShapeId.value = editShapeData.value.shapeId;
        }

        await loadShapes();
      } catch (e) {
        alert((e as Error).message);
      }
    }

    async function confirmDeleteShape(shape: Shape) {
      shapeToDelete.value = shape;
      shapeUsages.value = await shapeApi.getUsages(props.id, shape.shapeId);
      showDeleteShapeDialog.value = true;
    }

    async function doDeleteShape() {
      if (!shapeToDelete.value) return;
      try {
        await shapeApi.delete(props.id, shapeToDelete.value.shapeId);
        showDeleteShapeDialog.value = false;

        // If we deleted the current shape, select another
        if (currentShapeId.value === shapeToDelete.value.shapeId) {
          currentShapeId.value = null;
        }

        shapeToDelete.value = null;
        await loadShapes();

        // Select first shape if available
        if (!currentShapeId.value && shapes.value.length > 0) {
          selectShape(shapes.value[0].shapeId);
        }
      } catch (e) {
        alert((e as Error).message);
      }
    }

    async function updateShapeLabel(label: string) {
      if (!currentShapeId.value) return;
      try {
        await shapeApi.update(props.id, currentShapeId.value, { shapeLabel: label });
        await loadShapes();
      } catch (e) {
        console.error('Failed to update shape label:', e);
      }
    }

    async function updateResourceURI(resourceURI: string) {
      if (!currentShapeId.value) return;
      try {
        await shapeApi.update(props.id, currentShapeId.value, { resourceURI });
        await loadShapes();
      } catch (e) {
        console.error('Failed to update resource URI:', e);
      }
    }

    async function updateDescription(description: string | null) {
      if (!currentShapeId.value) return;
      try {
        await shapeApi.update(props.id, currentShapeId.value, { description: description || '' });
        await loadShapes();
      } catch (e) {
        console.error('Failed to update description:', e);
      }
    }

    function exportWorkspace(format: 'csv' | 'tsv') {
      window.open(importExportApi.getExportUrl(props.id, format), '_blank');
    }

    async function exportMarvaProfile() {
      // Export Marva profile
      window.open(marvaProfileApi.getExportUrl(props.id), '_blank');

      // Also export starting points if they exist
      try {
        const hasStartingPoints = await startingPointApi.hasStartingPoints(props.id);
        if (hasStartingPoints) {
          // Small delay to avoid browser blocking multiple downloads
          setTimeout(() => {
            window.open(startingPointApi.getExportUrl(props.id), '_blank');
          }, 500);
        }
      } catch (e) {
        // Silently ignore if starting points check fails
        console.error('Failed to check starting points:', e);
      }
    }

    // Starting point import functions
    function triggerStartingPointImport() {
      startingPointFileInput.value?.click();
    }

    async function handleStartingPointFileSelect(event: Event) {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;

      importingStartingPoints.value = true;
      try {
        const text = await file.text();
        const data = JSON.parse(text);

        const result = await startingPointApi.importFile(props.id, data);
        alert(`Successfully imported ${result.shapesCreated} shapes and ${result.rowsCreated} rows.`);

        // Refresh shapes and folders
        await Promise.all([loadShapes(), loadFolders()]);
      } catch (e) {
        alert(`Failed to import starting points: ${(e as Error).message}`);
      } finally {
        importingStartingPoints.value = false;
        // Reset file input
        if (input) input.value = '';
      }
    }

    // Folder functions
    function toggleFolder(folderId: number) {
      if (expandedFolders.value.has(folderId)) {
        expandedFolders.value.delete(folderId);
      } else {
        expandedFolders.value.add(folderId);
      }
    }

    function isFolderCollapsed(folderId: number): boolean {
      return !expandedFolders.value.has(folderId);
    }

    async function createFolder() {
      if (!newFolderName.value.trim()) return;
      try {
        await folderApi.create(props.id, newFolderName.value.trim());
        showNewFolderDialog.value = false;
        newFolderName.value = '';
        await loadFolders();
      } catch (e) {
        alert((e as Error).message);
      }
    }

    async function deleteFolder(folder: Folder) {
      if (!confirm(`Delete folder "${folder.name}"? Shapes inside will be moved to root.`)) return;
      try {
        await folderApi.delete(props.id, folder.id);
        await Promise.all([loadFolders(), loadShapes()]);
      } catch (e) {
        alert((e as Error).message);
      }
    }

    // Drag and drop handlers
    function handleShapeDragStart(shapeId: string, event: DragEvent) {
      draggedShapeId.value = shapeId;
      event.dataTransfer!.effectAllowed = 'move';
      event.dataTransfer!.setData('text/plain', shapeId);
    }

    function handleShapeDragEnd() {
      draggedShapeId.value = null;
      dragOverFolderId.value = null;
    }

    function handleFolderDragOver(folderId: number | null, event: DragEvent) {
      if (!draggedShapeId.value) return;
      event.preventDefault();
      dragOverFolderId.value = folderId === null ? 'root' : folderId;
    }

    function handleFolderDragLeave() {
      dragOverFolderId.value = null;
    }

    async function handleFolderDrop(folderId: number | null, event: DragEvent) {
      event.preventDefault();
      if (!draggedShapeId.value) return;

      const shapeId = draggedShapeId.value;
      const shape = shapes.value.find(s => s.shapeId === shapeId);
      if (!shape) return;

      // Only update if folder changed
      if (shape.folderId !== folderId) {
        try {
          await shapeApi.update(props.id, shapeId, { folderId });
          await loadShapes();
        } catch (e) {
          console.error('Failed to move shape:', e);
        }
      }

      draggedShapeId.value = null;
      dragOverFolderId.value = null;
    }

    // Watch for route changes
    watch(() => props.shapeId, (newShapeId) => {
      if (newShapeId && newShapeId !== currentShapeId.value) {
        currentShapeId.value = newShapeId;
      }
    });

    // Auto-focus dialogs when opened
    watch(showNewShapeDialog, (isOpen) => {
      if (isOpen) {
        nextTick(() => newShapeIdInput.value?.focus());
      }
    });

    watch(showNewFolderDialog, (isOpen) => {
      if (isOpen) {
        nextTick(() => newFolderNameInput.value?.focus());
      }
    });

    onMounted(async () => {
      await loadWorkspace();
      // Only start polling if workspace was found
      if (workspace.value) {
        startPolling();
      }
    });

    onUnmounted(() => {
      stopPolling();
    });

    return {
      workspace,
      shapes,
      namespaces,
      currentShapeId,
      currentShape,
      sortedShapes,
      loading,
      error,
      sidebarCollapsed,
      showNewShapeDialog,
      newShapeId,
      newShapeLabel,
      newShapeIdInput,
      showEditShapeDialog,
      editShapeData,
      showDeleteShapeDialog,
      shapeToDelete,
      shapeUsages,
      showNamespaceManager,
      goHome,
      selectShape,
      createShape,
      editShape,
      doEditShape,
      confirmDeleteShape,
      doDeleteShape,
      updateShapeLabel,
      updateDescription,
      updateResourceURI,
      exportWorkspace,
      exportMarvaProfile,
      loadNamespaces,
      // Folders
      folders,
      sortedFolders,
      rootShapes,
      shapesByFolder,
      expandedFolders,
      showNewFolderDialog,
      newFolderName,
      newFolderNameInput,
      toggleFolder,
      isFolderCollapsed,
      createFolder,
      deleteFolder,
      // Drag and drop
      draggedShapeId,
      dragOverFolderId,
      handleShapeDragStart,
      handleShapeDragEnd,
      handleFolderDragOver,
      handleFolderDragLeave,
      handleFolderDrop,
      // Options
      showOptionsDialog,
      workspaceOptions,
      toggleLCColumns,
      // Starting point import
      startingPointFileInput,
      importingStartingPoints,
      triggerStartingPointImport,
      handleStartingPointFileSelect
    };
  }
});
</script>

<style scoped>
.workspace-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.workspace-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: white;
  border-bottom: 1px solid #e0e0e0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.header-left h1 {
  font-size: 1.25rem;
  color: #2c3e50;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.lock-icon {
  font-size: 1rem;
  color: #7f8c8d;
}

.locked-badge {
  display: inline-block;
  background: #f39c12;
  color: white;
  font-size: 0.7rem;
  padding: 0.2rem 0.5rem;
  border-radius: 3px;
  font-weight: 600;
  text-transform: uppercase;
}

.header-right {
  display: flex;
  gap: 0.5rem;
}

.workspace-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.sidebar {
  width: 280px;
  background: white;
  border-right: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  transition: width 0.2s;
}

.sidebar.collapsed {
  width: 48px;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  border-bottom: 1px solid #e0e0e0;
}

.sidebar-header h2 {
  font-size: 1rem;
  color: #2c3e50;
}

.sidebar.collapsed .sidebar-header h2 {
  display: none;
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem;
}

.btn-full {
  width: 100%;
  margin-bottom: 0.75rem;
}

.shape-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.shape-item {
  padding: 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  position: relative;
}

.shape-item:hover {
  background: #f0f0f0;
}

.shape-item.active {
  background: #e3f2fd;
}

.shape-name {
  font-weight: 500;
}

.shape-label {
  font-size: 0.85rem;
  color: #666;
}

.shape-actions {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  display: none;
  gap: 0.25rem;
}

.shape-item:hover .shape-actions {
  display: flex;
}

.main-content {
  flex: 1;
  overflow: hidden;
  background: #fafafa;
}

.loading,
.error,
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #666;
}

.error {
  color: #e74c3c;
}

/* Buttons */
.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  font-weight: 500;
  transition: background-color 0.2s;
  cursor: pointer;
}

.btn-icon {
  padding: 0.25rem 0.5rem;
  background: transparent;
  border: none;
  font-size: 1rem;
  cursor: pointer;
}

.btn-icon:hover {
  background: #e0e0e0;
}

.btn-small {
  padding: 0.125rem 0.375rem;
  font-size: 0.85rem;
}

.btn-primary {
  background-color: #3498db;
  color: white;
}

.btn-primary:hover {
  background-color: #2980b9;
}

.btn-primary:disabled {
  background-color: #bdc3c7;
  cursor: not-allowed;
}

.btn-secondary {
  background-color: #ecf0f1;
  color: #2c3e50;
}

.btn-secondary:hover:not(:disabled) {
  background-color: #d5dbdb;
}

.btn-secondary:disabled {
  background-color: #f5f5f5;
  color: #bdc3c7;
  cursor: not-allowed;
}

.btn-danger {
  background-color: #e74c3c;
  color: white;
}

.btn-danger:hover {
  background-color: #c0392b;
}

/* Dialogs */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  min-width: 400px;
  max-width: 90%;
}

.dialog h2 {
  margin-bottom: 1rem;
  color: #2c3e50;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.form-group input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.form-group input:focus {
  outline: none;
  border-color: #3498db;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
}

.warning {
  color: #e74c3c;
  background: #ffeaea;
  padding: 0.75rem;
  border-radius: 4px;
}

/* Sidebar buttons */
.sidebar-buttons {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.btn-grow {
  flex: 1;
}

/* Root drop zone */
.root-drop-zone {
  min-height: 20px;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.root-drop-zone.drag-over {
  background: #e3f2fd;
}

/* Folder styles */
.folder-list {
  margin-top: 0.5rem;
}

.folder-container {
  margin-bottom: 0.25rem;
}

.folder-header {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.2s;
}

.folder-header:hover {
  background: #f0f0f0;
}

.folder-header.drag-over {
  background: #e3f2fd;
  outline: 2px dashed #3498db;
}

.folder-toggle {
  font-size: 0.7rem;
  color: #666;
  width: 12px;
}

.folder-icon {
  font-size: 1rem;
}

.folder-name {
  font-weight: 500;
  flex: 1;
}

.folder-count {
  font-size: 0.85rem;
  color: #888;
}

.folder-actions {
  display: none;
}

.folder-header:hover .folder-actions {
  display: flex;
}

.folder-shapes {
  padding-left: 1.25rem;
}

/* Dragging styles */
.shape-item.dragging {
  opacity: 0.5;
}

.shape-item[draggable="true"] {
  cursor: grab;
}

.shape-item[draggable="true"]:active {
  cursor: grabbing;
}

/* Options dialog */
.options-dialog {
  min-width: 450px;
}

.option-item {
  padding: 0.75rem;
  background: #f8f9fa;
  border-radius: 4px;
  margin-bottom: 1rem;
}

.option-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-weight: 500;
}

.option-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.option-text {
  font-size: 1rem;
}

.option-description {
  margin: 0.5rem 0 0 1.75rem;
  font-size: 0.875rem;
  color: #666;
}

.option-header {
  font-weight: 500;
  margin-bottom: 0.25rem;
}

.btn-small-margin {
  margin-top: 0.75rem;
  margin-left: 1.75rem;
}
</style>
