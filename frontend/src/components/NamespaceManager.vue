<template>
  <div class="dialog-overlay" @click.self="$emit('close')">
    <div class="dialog namespace-dialog">
      <div class="dialog-header">
        <h2>Namespace Prefixes</h2>
        <button class="btn btn-icon" @click="$emit('close')">&times;</button>
      </div>

      <div class="namespace-list">
        <table>
          <thead>
            <tr>
              <th>Prefix</th>
              <th>Namespace URI</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ns in namespaces" :key="ns.prefix">
              <td>
                <template v-if="editingPrefix === ns.prefix">
                  <input
                    v-model="editForm.namespace"
                    type="text"
                    class="edit-input"
                  />
                </template>
                <template v-else>
                  {{ ns.prefix }}
                </template>
              </td>
              <td>
                <template v-if="editingPrefix === ns.prefix">
                  <input
                    v-model="editForm.namespace"
                    type="text"
                    class="edit-input"
                    @keydown.enter="saveEdit"
                    @keydown.escape="cancelEdit"
                  />
                </template>
                <template v-else>
                  {{ ns.namespace }}
                </template>
              </td>
              <td class="actions">
                <template v-if="editingPrefix === ns.prefix">
                  <button class="btn btn-small btn-primary" @click="saveEdit">Save</button>
                  <button class="btn btn-small btn-secondary" @click="cancelEdit">Cancel</button>
                </template>
                <template v-else>
                  <button class="btn btn-small btn-secondary" @click="startEdit(ns)">Edit</button>
                  <button class="btn btn-small btn-danger" @click="deleteNamespace(ns.prefix)">Delete</button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="add-namespace">
        <h3>Add New Prefix</h3>
        <form @submit.prevent="addNamespace" class="add-form">
          <input
            v-model="newPrefix"
            type="text"
            placeholder="Prefix (e.g., schema)"
            required
          />
          <input
            v-model="newNamespace"
            type="text"
            placeholder="Namespace URI (e.g., https://schema.org/)"
            required
          />
          <button type="submit" class="btn btn-primary" :disabled="!newPrefix || !newNamespace">
            Add
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, PropType } from 'vue';
import { namespaceApi } from '@/services/api';
import type { Namespace } from '@/types';

export default defineComponent({
  name: 'NamespaceManager',
  props: {
    workspaceId: {
      type: String,
      required: true
    },
    namespaces: {
      type: Array as PropType<Namespace[]>,
      required: true
    }
  },
  emits: ['close', 'update'],
  setup(props, { emit }) {
    const editingPrefix = ref<string | null>(null);
    const editForm = ref({ prefix: '', namespace: '' });
    const newPrefix = ref('');
    const newNamespace = ref('');

    function startEdit(ns: Namespace) {
      editingPrefix.value = ns.prefix;
      editForm.value = { prefix: ns.prefix, namespace: ns.namespace };
    }

    function cancelEdit() {
      editingPrefix.value = null;
      editForm.value = { prefix: '', namespace: '' };
    }

    async function saveEdit() {
      if (!editingPrefix.value || !editForm.value.namespace) return;

      try {
        await namespaceApi.update(props.workspaceId, editingPrefix.value, editForm.value.namespace);
        emit('update');
        cancelEdit();
      } catch (e) {
        alert((e as Error).message);
      }
    }

    async function deleteNamespace(prefix: string) {
      if (!confirm(`Delete prefix "${prefix}"?`)) return;

      try {
        await namespaceApi.delete(props.workspaceId, prefix);
        emit('update');
      } catch (e) {
        alert((e as Error).message);
      }
    }

    async function addNamespace() {
      if (!newPrefix.value || !newNamespace.value) return;

      try {
        await namespaceApi.create(props.workspaceId, newPrefix.value.trim(), newNamespace.value.trim());
        newPrefix.value = '';
        newNamespace.value = '';
        emit('update');
      } catch (e) {
        alert((e as Error).message);
      }
    }

    return {
      editingPrefix,
      editForm,
      newPrefix,
      newNamespace,
      startEdit,
      cancelEdit,
      saveEdit,
      deleteNamespace,
      addNamespace
    };
  }
});
</script>

<style scoped>
.namespace-dialog {
  width: 700px;
  max-width: 90%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e0e0e0;
  margin-bottom: 1rem;
}

.dialog-header h2 {
  margin: 0;
}

.namespace-list {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 1rem;
}

.namespace-list table {
  width: 100%;
  border-collapse: collapse;
}

.namespace-list th,
.namespace-list td {
  padding: 0.5rem;
  text-align: left;
  border-bottom: 1px solid #e0e0e0;
}

.namespace-list th {
  background: #f5f5f5;
  font-weight: 600;
}

.namespace-list .actions {
  white-space: nowrap;
}

.edit-input {
  width: 100%;
  padding: 0.25rem;
  border: 1px solid #3498db;
  border-radius: 4px;
}

.add-namespace {
  padding-top: 1rem;
  border-top: 1px solid #e0e0e0;
}

.add-namespace h3 {
  font-size: 1rem;
  margin-bottom: 0.75rem;
}

.add-form {
  display: flex;
  gap: 0.5rem;
}

.add-form input {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.add-form input:first-child {
  flex: 0 0 150px;
}

/* Button styles */
.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  font-weight: 500;
  cursor: pointer;
}

.btn-small {
  padding: 0.25rem 0.5rem;
  font-size: 0.85rem;
}

.btn-icon {
  width: 32px;
  height: 32px;
  padding: 0;
  background: transparent;
  font-size: 1.25rem;
  color: #666;
}

.btn-icon:hover {
  background: #f0f0f0;
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

.btn-secondary:hover {
  background-color: #d5dbdb;
}

.btn-danger {
  background-color: #e74c3c;
  color: white;
}

.btn-danger:hover {
  background-color: #c0392b;
}

/* Dialog overlay */
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
}
</style>
