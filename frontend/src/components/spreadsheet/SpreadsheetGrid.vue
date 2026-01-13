<template>
  <div
    class="spreadsheet-container"
    @keydown="handleKeyDown"
    tabindex="0"
    ref="containerRef"
  >
    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="shape-id">{{ shapeId }}</span>
        <span v-if="isLocked" class="locked-indicator" title="This workspace is locked (read-only)">&#128274; Read-only</span>
        <span
          v-if="!isLocked"
          class="shape-description"
          :class="{ 'no-description': !description }"
          @click="startEditDescription"
          :title="description || 'Click to add description'"
        >
          <span class="description-text">{{ description || 'No description' }}</span>
          <span class="edit-icon">&#9998;</span>
        </span>
        <span v-else-if="description" class="shape-description-readonly">
          {{ description }}
        </span>
        <span v-if="saving" class="save-indicator saving">Saving...</span>
        <span v-else-if="showSavedIndicator" class="save-indicator saved">Saved</span>
        <span v-else-if="hasUnsavedChanges" class="save-indicator unsaved">Unsaved changes</span>
      </div>
      <div class="toolbar-right">
        <button class="btn btn-icon" @click="openSendToWorkspace" title="Send to other workspace">
          &#8599;
        </button>
        <button v-if="!isLocked" class="btn btn-icon" @click="undo" :disabled="!canUndo" title="Undo (Ctrl+Z)">
          &#8630;
        </button>
        <button v-if="!isLocked" class="btn btn-icon" @click="redo" :disabled="!canRedo" title="Redo (Ctrl+Y)">
          &#8631;
        </button>
      </div>
    </div>

    <!-- Grid -->
    <div class="grid-wrapper" ref="gridWrapper">
      <table class="grid">
        <thead>
          <tr>
            <th class="row-number-header">#</th>
            <th
              v-for="col in columns"
              :key="col.key"
              :style="{ width: col.width + 'px' }"
              class="column-header"
            >
              {{ col.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, rowIndex) in displayRows"
            :key="row.id ? `row-${row.id}` : `pos-${rowIndex}`"
            :class="{
              'has-errors': row.hasErrors === 1,
              'row-selected': isRowSelected(rowIndex),
              'drag-over': dragOverRowIndex === rowIndex
            }"
          >
            <td
              class="row-number"
              :class="{ 'row-selected': isRowSelected(rowIndex) }"
              @click="selectRow(rowIndex, $event)"
              :draggable="row.id ? true : false"
              @dragstart="handleDragStart(rowIndex, $event)"
              @dragend="handleDragEnd"
              @dragover.prevent="handleDragOver(rowIndex, $event)"
              @drop="handleDrop(rowIndex, $event)"
            >
              <span class="drag-handle" v-if="row.id">&#8942;</span>
              <span class="row-num">{{ rowIndex + 1 }}</span>
            </td>
            <td
              v-for="(col, colIndex) in columns"
              :key="col.key"
              :class="getCellClass(rowIndex, colIndex, row, col)"
              @mousedown="handleMouseDown(rowIndex, colIndex, $event)"
              @mouseover="handleMouseOver(rowIndex, colIndex, $event)"
              @dblclick="startEditing(rowIndex, colIndex)"
              @mouseenter="showErrorTooltip(row, col.key, rowIndex, colIndex, $event)"
              @mouseleave="hideErrorTooltip"
            >
              <!-- Checkbox columns are always shown inline -->
              <template v-if="col.editorType === 'checkbox'">
                <input
                  type="checkbox"
                  class="inline-checkbox"
                  :checked="getCellValue(row, col.key, rowIndex) === 'true' || getCellValue(row, col.key, rowIndex) === '1'"
                  :disabled="isCellDisabled(row, col)"
                  @change="handleInlineCheckbox(rowIndex, col.key, $event)"
                  @click.stop
                />
              </template>
              <!-- Dropdown columns are always shown inline -->
              <template v-else-if="col.editorType === 'dropdown'">
                <select
                  class="inline-dropdown"
                  :value="getCellValue(row, col.key, rowIndex) || ''"
                  :disabled="isCellDisabled(row, col)"
                  @change="handleInlineDropdown(rowIndex, col.key, $event)"
                  @click.stop
                >
                  <option value=""></option>
                  <option v-for="opt in col.options" :key="opt" :value="opt">
                    {{ opt }}
                  </option>
                </select>
              </template>
              <template v-else-if="isEditing(rowIndex, colIndex)">
                <CellEditor
                  :column="col"
                  :value="getCellValue(row, col.key, rowIndex)"
                  :shapes="shapes"
                  :namespaces="namespaces"
                  :current-shape-id="shapeId"
                  :disabled="isCellDisabled(row, col)"
                  @update="updateCell(rowIndex, col.key, $event)"
                  @blur="finishEditing"
                  @cancel="cancelEditing"
                />
              </template>
              <template v-else>
                <span
                  v-if="(col.editorType === 'multiline' || col.editorType === 'multiline-typeahead') && hasMultipleValues(row, col.key)"
                  class="cell-content multiline-content"
                  :class="{ disabled: isCellDisabled(row, col) }"
                  :title="getCellError(row, col.key) ?? undefined"
                >
                  <span v-for="(line, idx) in getMultilineValues(row, col.key)" :key="idx" class="multiline-value">{{ line }}</span>
                </span>
                <span
                  v-else
                  class="cell-content"
                  :class="{ disabled: isCellDisabled(row, col) }"
                  :title="getCellError(row, col.key) ?? undefined"
                >
                  {{ formatCellValue(row, col, rowIndex) }}
                </span>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Error Tooltip -->
    <div
      v-if="errorTooltip.visible"
      class="error-tooltip"
      :style="{ left: errorTooltip.x + 'px', top: errorTooltip.y + 'px' }"
    >
      {{ errorTooltip.message }}
    </div>

    <!-- Context Menu -->
    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
    >
      <button @click="insertRowAbove">Insert row above</button>
      <button @click="insertRowBelow">Insert row below</button>
      <button @click="deleteSelectedRows">Delete row(s)</button>
      <hr />
      <button @click="copySelection">Copy</button>
      <button @click="cutSelection">Cut</button>
      <button @click="pasteFromClipboard">Paste</button>
    </div>

    <!-- Send to Workspace Modal -->
    <div v-if="showSendToWorkspace" class="dialog-overlay" @click.self="closeSendToWorkspace">
      <div class="dialog send-to-workspace-dialog">
        <h2>Send to Other Workspace</h2>
        <p class="dialog-description">
          Send shape "{{ shapeId }}" to another workspace.
        </p>

        <div v-if="loadingWorkspaces" class="loading-workspaces">
          Loading workspaces...
        </div>

        <div v-else-if="otherWorkspaces.length === 0" class="no-workspaces">
          No other workspaces available. Create another workspace first.
        </div>

        <div v-else class="workspace-list">
          <label
            v-for="ws in otherWorkspaces"
            :key="ws.id"
            class="workspace-option"
            :class="{ selected: selectedTargetWorkspace === ws.id }"
          >
            <input
              type="radio"
              :value="ws.id"
              v-model="selectedTargetWorkspace"
              @change="checkShapeExists"
            />
            <span class="workspace-name">{{ ws.name }}</span>
          </label>
        </div>

        <div v-if="shapeExistsInTarget" class="warning-message">
          Warning: A shape with ID "{{ shapeId }}" already exists in the selected workspace. Sending will overwrite it.
        </div>

        <div class="dialog-actions">
          <button type="button" class="btn btn-secondary" @click="closeSendToWorkspace">
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="!selectedTargetWorkspace || sendingShape"
            @click="doSendToWorkspace"
          >
            {{ sendingShape ? 'Sending...' : 'Send' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted, watch, nextTick, PropType } from 'vue';
import { rowApi, validationApi, workspaceApi, shapeApi } from '@/services/api';
import type { StatementRow, Shape, Namespace, Selection, UndoState, ColumnDef, Workspace } from '@/types';
import { COLUMNS } from '@/types';
import CellEditor from './CellEditor.vue';

const EMPTY_ROWS_COUNT = 20;

export default defineComponent({
  name: 'SpreadsheetGrid',
  components: {
    CellEditor
  },
  props: {
    workspaceId: {
      type: String,
      required: true
    },
    shapeId: {
      type: String,
      required: true
    },
    shapes: {
      type: Array as PropType<Shape[]>,
      required: true
    },
    namespaces: {
      type: Array as PropType<Namespace[]>,
      required: true
    },
    shapeLabel: {
      type: String,
      default: ''
    },
    description: {
      type: String,
      default: ''
    },
    resourceURI: {
      type: String,
      default: ''
    },
    useLCColumns: {
      type: Boolean,
      default: false
    },
    isLocked: {
      type: Boolean,
      default: false
    }
  },
  emits: ['shape-label-change', 'description-change', 'resource-uri-change'],
  setup(props, { emit }) {
    const containerRef = ref<HTMLDivElement | null>(null);
    const gridWrapper = ref<HTMLDivElement | null>(null);

    // Data
    const rows = ref<StatementRow[]>([]);
    const loading = ref(false);
    const saving = ref(false);
    const hasUnsavedChanges = ref(false);

    // Selection
    const selection = ref<Selection | null>(null);
    const isSelecting = ref(false);

    // Editing
    const editingCell = ref<{ row: number; col: number } | null>(null);

    // Undo/Redo
    const undoStack = ref<UndoState[]>([]);
    const redoStack = ref<UndoState[]>([]);

    // Context menu
    const contextMenu = ref({ visible: false, x: 0, y: 0 });

    // Error tooltip
    const errorTooltip = ref({ visible: false, x: 0, y: 0, message: '' });

    // Clipboard
    const clipboardData = ref<string[][] | null>(null);
    const cutMode = ref(false);

    // Save indicator
    const showSavedIndicator = ref(false);
    let savedIndicatorTimeout: ReturnType<typeof setTimeout> | null = null;

    // Drag and drop for row reordering
    const draggedRowIndex = ref<number | null>(null);
    const dragOverRowIndex = ref<number | null>(null);

    // Send to workspace modal
    const showSendToWorkspace = ref(false);
    const allWorkspaces = ref<Workspace[]>([]);
    const loadingWorkspaces = ref(false);
    const selectedTargetWorkspace = ref<string | null>(null);
    const shapeExistsInTarget = ref(false);
    const sendingShape = ref(false);

    const otherWorkspaces = computed(() => {
      return allWorkspaces.value.filter(ws => ws.id !== props.workspaceId);
    });

    // LC-specific columns that are hidden when useLCColumns is false
    const LC_COLUMN_KEYS = ['resourceURI', 'lcDefaultLiteral', 'lcDefaultURI', 'lcDataTypeURI', 'lcRemark'];

    const columns = computed(() => {
      if (props.useLCColumns) {
        return COLUMNS;
      }
      return COLUMNS.filter(col => !LC_COLUMN_KEYS.includes(col.key));
    });

    // Create display rows (actual rows + empty rows)
    const displayRows = computed(() => {
      const result: Array<StatementRow | Partial<StatementRow>> = [...rows.value];
      // Add empty rows
      for (let i = 0; i < EMPTY_ROWS_COUNT; i++) {
        result.push(createEmptyRow(rows.value.length + i));
      }
      return result;
    });

    const canUndo = computed(() => undoStack.value.length > 0);
    const canRedo = computed(() => redoStack.value.length > 0);

    function createEmptyRow(order: number): Partial<StatementRow> {
      return {
        id: undefined,
        rowOrder: order,
        propertyId: null,
        propertyLabel: null,
        mandatory: null,
        repeatable: null,
        valueNodeType: null,
        valueDataType: null,
        valueShape: null,
        valueConstraint: null,
        valueConstraintType: null,
        note: null,
        hasErrors: 0,
        errorDetails: null
      };
    }

    async function loadRows() {
      loading.value = true;
      try {
        const loadedRows = await rowApi.list(props.workspaceId, props.shapeId);

        // Clean up any empty rows that shouldn't exist
        const dataColumnKeys = ['propertyId', 'propertyLabel', 'mandatory', 'repeatable',
                                'valueNodeType', 'valueDataType', 'valueShape', 'valueConstraint',
                                'valueConstraintType', 'note', 'lcDefaultLiteral', 'lcDefaultURI',
                                'lcDataTypeURI', 'lcRemark'];

        const emptyRowIds: number[] = [];
        const nonEmptyRows: StatementRow[] = [];

        for (const row of loadedRows) {
          const isRowEmpty = dataColumnKeys.every(k => {
            const v = (row as unknown as Record<string, unknown>)[k];
            return v === null || v === undefined || v === '';
          });

          if (isRowEmpty) {
            console.log('Found empty row to delete:', row.id);
            emptyRowIds.push(row.id);
          } else {
            nonEmptyRows.push(row);
          }
        }

        // Delete empty rows from backend
        if (emptyRowIds.length > 0) {
          console.log('Deleting empty rows:', emptyRowIds);
          await rowApi.bulkDelete(props.workspaceId, props.shapeId, emptyRowIds);
        }

        rows.value = nonEmptyRows;
      } catch (e) {
        console.error('Failed to load rows:', e);
      } finally {
        loading.value = false;
      }
    }

    function getCellValue(row: Partial<StatementRow>, key: string, rowIndex?: number): string | null {
      if (key === 'shapeLabel') {
        // Only first row shows shape label
        return rowIndex === 0 ? props.shapeLabel : null;
      }
      if (key === 'resourceURI') {
        // Only first row shows resource URI
        return rowIndex === 0 ? props.resourceURI : null;
      }
      return (row as Record<string, unknown>)[key] as string | null;
    }

    function formatCellValue(row: Partial<StatementRow>, col: ColumnDef, rowIndex: number): string {
      const value = getCellValue(row, col.key, rowIndex);
      if (value === null || value === undefined) return '';

      if (col.editorType === 'checkbox') {
        return value === 'true' || value === '1' ? '✓' : '';
      }

      return String(value);
    }

    function hasMultipleValues(row: Partial<StatementRow>, key: string): boolean {
      const value = (row as Record<string, unknown>)[key] as string | null;
      if (!value) return false;
      return /[,|\n]/.test(value);
    }

    function getMultilineValues(row: Partial<StatementRow>, key: string): string[] {
      const value = (row as Record<string, unknown>)[key] as string | null;
      if (!value) return [];
      return value.split(/[,|\n]/).map(s => s.trim()).filter(s => s);
    }

    function getCellClass(rowIndex: number, colIndex: number, row: Partial<StatementRow>, col: ColumnDef): Record<string, boolean> {
      const isSelected = isInSelection(rowIndex, colIndex);
      const isActive = selection.value?.start.row === rowIndex && selection.value?.start.col === colIndex;
      const hasError = getCellError(row, col.key) !== null;

      return {
        'cell': true,
        'selected': isSelected,
        'active': isActive,
        'editing': isEditing(rowIndex, colIndex),
        'has-cell-error': hasError,
        'disabled': isCellDisabled(row as StatementRow, col)
      };
    }

    function getCellError(row: Partial<StatementRow>, key: string): string | null {
      if (!row.errorDetails) return null;
      try {
        const errors = JSON.parse(row.errorDetails);
        const error = errors.find((e: { column: string }) => e.column === key);
        return error?.message || null;
      } catch {
        return null;
      }
    }

    function isCellDisabled(row: Partial<StatementRow>, col: ColumnDef): boolean {
      if (col.disabled) {
        return col.disabled(row as StatementRow);
      }
      if (col.firstRowOnly) {
        const rowIndex = rows.value.findIndex(r => r.id === row.id);
        return rowIndex > 0;
      }
      return false;
    }

    function isInSelection(rowIndex: number, colIndex: number): boolean {
      if (!selection.value) return false;
      const { start, end } = selection.value;
      const minRow = Math.min(start.row, end.row);
      const maxRow = Math.max(start.row, end.row);
      const minCol = Math.min(start.col, end.col);
      const maxCol = Math.max(start.col, end.col);
      return rowIndex >= minRow && rowIndex <= maxRow && colIndex >= minCol && colIndex <= maxCol;
    }

    function isRowSelected(rowIndex: number): boolean {
      if (!selection.value) return false;
      const { start, end } = selection.value;
      const minRow = Math.min(start.row, end.row);
      const maxRow = Math.max(start.row, end.row);
      // Row is selected if selection spans all columns
      const minCol = Math.min(start.col, end.col);
      const maxCol = Math.max(start.col, end.col);
      return rowIndex >= minRow && rowIndex <= maxRow && minCol === 0 && maxCol === columns.value.length - 1;
    }

    function selectRow(rowIndex: number, event: MouseEvent) {
      if (event.shiftKey && selection.value) {
        // Extend selection to include this row
        selection.value.end = { row: rowIndex, col: columns.value.length - 1 };
        // Ensure start col is 0 for full row selection
        selection.value.start.col = 0;
      } else {
        // Select entire row
        selection.value = {
          start: { row: rowIndex, col: 0 },
          end: { row: rowIndex, col: columns.value.length - 1 }
        };
      }
      containerRef.value?.focus();
    }

    function isEditing(rowIndex: number, colIndex: number): boolean {
      return editingCell.value?.row === rowIndex && editingCell.value?.col === colIndex;
    }

    // Mouse handlers
    function handleMouseDown(rowIndex: number, colIndex: number, event: MouseEvent) {
      // Right click for context menu
      if (event.button === 2) {
        event.preventDefault();
        showContextMenu(event.clientX, event.clientY);
        return;
      }

      // Hide context menu
      contextMenu.value.visible = false;

      // If clicking within the currently editing cell, don't interfere
      // This allows clicking inside a textarea/input to position the cursor
      if (editingCell.value && editingCell.value.row === rowIndex && editingCell.value.col === colIndex) {
        return;
      }

      // Cancel editing if clicking elsewhere
      if (editingCell.value) {
        finishEditing();
      }

      if (event.shiftKey && selection.value) {
        // Extend selection
        selection.value.end = { row: rowIndex, col: colIndex };
      } else {
        // Start new selection
        selection.value = {
          start: { row: rowIndex, col: colIndex },
          end: { row: rowIndex, col: colIndex }
        };
        isSelecting.value = true;
      }

      // Focus container for keyboard events
      containerRef.value?.focus();
    }

    function handleMouseOver(rowIndex: number, colIndex: number, _event: MouseEvent) {
      if (isSelecting.value && selection.value) {
        selection.value.end = { row: rowIndex, col: colIndex };
      }
    }

    function handleMouseUp() {
      isSelecting.value = false;
    }

    // Drag and drop for row reordering
    function handleDragStart(rowIndex: number, event: DragEvent) {
      const row = displayRows.value[rowIndex];
      if (!row.id) return; // Can't drag empty rows

      draggedRowIndex.value = rowIndex;
      event.dataTransfer!.effectAllowed = 'move';
      event.dataTransfer!.setData('text/plain', String(rowIndex));

      // Add dragging class after a small delay
      setTimeout(() => {
        const tr = (event.target as HTMLElement).closest('tr');
        tr?.classList.add('dragging');
      }, 0);
    }

    function handleDragEnd() {
      draggedRowIndex.value = null;
      dragOverRowIndex.value = null;
      // Remove dragging class from all rows
      document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    }

    function handleDragOver(rowIndex: number, _event: DragEvent) {
      if (draggedRowIndex.value === null) return;
      if (rowIndex === draggedRowIndex.value) return;

      const targetRow = displayRows.value[rowIndex];
      // Only allow dropping on existing rows or the first empty row
      if (!targetRow.id && rowIndex > rows.value.length) return;

      dragOverRowIndex.value = rowIndex;
    }

    async function handleDrop(targetRowIndex: number, event: DragEvent) {
      event.preventDefault();

      if (draggedRowIndex.value === null) return;
      if (targetRowIndex === draggedRowIndex.value) return;

      const sourceIndex = draggedRowIndex.value;
      const sourceRow = rows.value[sourceIndex];

      if (!sourceRow) return;

      // Reorder rows
      const newRows = [...rows.value];
      newRows.splice(sourceIndex, 1);

      // Adjust target index if needed
      const adjustedTarget = targetRowIndex > sourceIndex ? targetRowIndex - 1 : targetRowIndex;
      newRows.splice(adjustedTarget, 0, sourceRow);

      // Update row orders
      newRows.forEach((row, index) => {
        row.rowOrder = index;
      });

      rows.value = newRows;

      // Save to backend
      saving.value = true;
      try {
        await rowApi.reorder(props.workspaceId, props.shapeId, newRows.map(r => r.id));
        showSaved();
      } catch (e) {
        console.error('Failed to reorder rows:', e);
        hasUnsavedChanges.value = true;
      } finally {
        saving.value = false;
      }

      draggedRowIndex.value = null;
      dragOverRowIndex.value = null;
    }

    function showSaved() {
      if (savedIndicatorTimeout) {
        clearTimeout(savedIndicatorTimeout);
      }
      showSavedIndicator.value = true;
      savedIndicatorTimeout = setTimeout(() => {
        showSavedIndicator.value = false;
      }, 2000);
    }

    // Keyboard handlers
    function handleKeyDown(event: KeyboardEvent) {
      // Don't handle if editing
      if (editingCell.value) return;

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? event.metaKey : event.ctrlKey;

      // Navigation
      if (event.key.startsWith('Arrow')) {
        event.preventDefault();
        navigate(event.key, event.shiftKey);
        return;
      }

      // Enter to edit
      if (event.key === 'Enter' && selection.value) {
        event.preventDefault();
        startEditing(selection.value.start.row, selection.value.start.col);
        return;
      }

      // Tab to move
      if (event.key === 'Tab') {
        event.preventDefault();
        moveSelection(event.shiftKey ? -1 : 1, 0);
        return;
      }

      // Delete/Backspace to clear
      if ((event.key === 'Delete' || event.key === 'Backspace') && selection.value) {
        event.preventDefault();
        clearSelection();
        return;
      }

      // Undo/Redo
      if (modKey && event.key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if (modKey && event.key === 'y') {
        event.preventDefault();
        redo();
        return;
      }

      // Copy/Cut/Paste
      if (modKey && event.key === 'c') {
        event.preventDefault();
        copySelection();
        return;
      }

      if (modKey && event.key === 'x') {
        event.preventDefault();
        cutSelection();
        return;
      }

      if (modKey && event.key === 'v') {
        event.preventDefault();
        pasteFromClipboard();
        return;
      }

      // Start editing on any printable character
      if (event.key.length === 1 && !modKey && selection.value) {
        startEditing(selection.value.start.row, selection.value.start.col, event.key);
      }
    }

    function navigate(key: string, shiftKey: boolean) {
      if (!selection.value) return;

      const delta = { row: 0, col: 0 };
      switch (key) {
        case 'ArrowUp': delta.row = -1; break;
        case 'ArrowDown': delta.row = 1; break;
        case 'ArrowLeft': delta.col = -1; break;
        case 'ArrowRight': delta.col = 1; break;
      }

      if (shiftKey) {
        // Extend selection
        const newRow = Math.max(0, Math.min(displayRows.value.length - 1, selection.value.end.row + delta.row));
        const newCol = Math.max(0, Math.min(columns.value.length - 1, selection.value.end.col + delta.col));
        selection.value.end = { row: newRow, col: newCol };
      } else {
        moveSelection(delta.col, delta.row);
      }
    }

    function moveSelection(deltaCol: number, deltaRow: number) {
      if (!selection.value) return;

      const newRow = Math.max(0, Math.min(displayRows.value.length - 1, selection.value.start.row + deltaRow));
      const newCol = Math.max(0, Math.min(columns.value.length - 1, selection.value.start.col + deltaCol));

      selection.value = {
        start: { row: newRow, col: newCol },
        end: { row: newRow, col: newCol }
      };
    }

    // Editing
    function startEditing(rowIndex: number, colIndex: number, initialValue?: string) {
      const col = columns.value[colIndex];
      const row = displayRows.value[rowIndex];

      // Check if cell is disabled
      if (isCellDisabled(row as StatementRow, col)) return;

      // Hide error tooltip when editing starts
      errorTooltip.value.visible = false;

      editingCell.value = { row: rowIndex, col: colIndex };

      // If initial value provided (from typing), it will be handled by the editor
    }

    function finishEditing() {
      console.log('finishEditing called, editingCell was:', editingCell.value);
      editingCell.value = null;
      // Refocus container for keyboard navigation
      nextTick(() => {
        containerRef.value?.focus();
      });
    }

    function cancelEditing() {
      console.log('cancelEditing called');
      editingCell.value = null;
      // Refocus container for keyboard navigation
      nextTick(() => {
        containerRef.value?.focus();
      });
    }

    function handleInlineCheckbox(rowIndex: number, key: string, event: Event) {
      const target = event.target as HTMLInputElement;
      const value = target.checked ? 'true' : 'false';
      updateCell(rowIndex, key, value);
    }

    function handleInlineDropdown(rowIndex: number, key: string, event: Event) {
      const target = event.target as HTMLSelectElement;
      const value = target.value || null;
      updateCell(rowIndex, key, value);
    }

    async function updateCell(rowIndex: number, key: string, value: string | null) {
      const row = displayRows.value[rowIndex];
      const isNewRow = !row.id;
      const oldValue = getCellValue(row as StatementRow, key);

      // Handle shape label separately
      if (key === 'shapeLabel') {
        if (value !== props.shapeLabel) {
          emit('shape-label-change', value);
        }
        return;
      }

      // Handle description separately
      if (key === 'description') {
        if (value !== props.description) {
          emit('description-change', value);
        }
        return;
      }

      // Handle resource URI separately
      if (key === 'resourceURI') {
        if (value !== props.resourceURI) {
          emit('resource-uri-change', value);
        }
        return;
      }

      // Don't save if value hasn't changed
      if (oldValue === value) return;

      // Add to undo stack
      pushUndo({
        type: 'cell',
        before: { rowIndex, key, value: oldValue, rowId: row.id },
        after: { rowIndex, key, value, rowId: row.id },
        rowId: row.id as number,
        column: key,
        timestamp: Date.now()
      });

      // Update local state
      (row as Record<string, unknown>)[key] = value;

      // Save to backend
      saving.value = true;
      try {
        if (isNewRow) {
          // Create new row with all current data from the display row
          // This ensures all values entered before save are preserved
          const rowData: Record<string, unknown> = {
            rowOrder: rowIndex
          };
          // Copy all existing values from the display row
          const columnKeys = ['propertyId', 'propertyLabel', 'mandatory', 'repeatable',
                             'valueNodeType', 'valueDataType', 'valueShape', 'valueConstraint',
                             'valueConstraintType', 'note', 'lcDefaultLiteral', 'lcDefaultURI',
                             'lcDataTypeURI', 'lcRemark'];
          for (const k of columnKeys) {
            const existingValue = (row as Record<string, unknown>)[k];
            if (existingValue !== null && existingValue !== undefined) {
              rowData[k] = existingValue;
            }
          }
          // Make sure the current edit is included
          rowData[key] = value;

          const newRow = await rowApi.create(props.workspaceId, props.shapeId, rowData);
          // Insert the new row at the correct position to maintain display order
          // This ensures subsequent edits to the same display row work correctly
          const insertIndex = rowIndex < rows.value.length ? rowIndex : rows.value.length;
          rows.value.splice(insertIndex, 0, newRow);
        } else {
          // Update existing row
          await rowApi.update(props.workspaceId, props.shapeId, row.id as number, {
            [key]: value
          });

          // Check if all data columns are now empty - if so, delete the row
          const dataColumnKeys = ['propertyId', 'propertyLabel', 'mandatory', 'repeatable',
                                  'valueNodeType', 'valueDataType', 'valueShape', 'valueConstraint',
                                  'valueConstraintType', 'note', 'lcDefaultLiteral', 'lcDefaultURI',
                                  'lcDataTypeURI', 'lcRemark'];
          const actualRow = rows.value.find(r => r.id === row.id);
          if (actualRow) {
            // Update local state first
            (actualRow as Record<string, unknown>)[key] = value;

            // Check if row is now empty - log all values for debugging
            console.log('Checking if row is empty after update. Row id:', row.id);
            console.log('Column values:');
            for (const k of dataColumnKeys) {
              const v = (actualRow as Record<string, unknown>)[k];
              console.log(`  ${k}: "${v}" (type: ${typeof v}, isEmpty: ${v === null || v === undefined || v === ''})`);
            }

            const isRowEmpty = dataColumnKeys.every(k => {
              const v = (actualRow as Record<string, unknown>)[k];
              return v === null || v === undefined || v === '';
            });
            console.log('isRowEmpty:', isRowEmpty);

            if (isRowEmpty) {
              // Delete the empty row
              console.log('Deleting empty row:', row.id);
              await rowApi.delete(props.workspaceId, props.shapeId, row.id as number);
              rows.value = rows.value.filter(r => r.id !== row.id);
              console.log('Row deleted, rows.value now has', rows.value.length, 'rows');
            } else {
              // Validate the row and save errors to backend
              const result = await validationApi.validateRow(props.workspaceId, props.shapeId, row);
              actualRow.hasErrors = result.errors.length > 0 ? 1 : 0;
              actualRow.errorDetails = result.errors.length > 0 ? JSON.stringify(result.errors) : null;
            }
          }
        }
        hasUnsavedChanges.value = false;
        showSaved();
      } catch (e) {
        console.error('Failed to save:', e);
        hasUnsavedChanges.value = true;
      } finally {
        saving.value = false;
      }
    }

    // Selection operations
    async function clearSelection() {
      if (!selection.value) return;

      const { start, end } = selection.value;
      const minRow = Math.min(start.row, end.row);
      const maxRow = Math.max(start.row, end.row);
      const minCol = Math.min(start.col, end.col);
      const maxCol = Math.max(start.col, end.col);

      const beforeState: unknown[] = [];

      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          const row = displayRows.value[r];
          const col = columns.value[c];
          if (!row.id) continue; // Skip empty rows

          const oldValue = getCellValue(row as StatementRow, col.key);
          beforeState.push({ rowId: row.id, key: col.key, value: oldValue });

          (row as Record<string, unknown>)[col.key] = null;
        }
      }

      if (beforeState.length > 0) {
        pushUndo({
          type: 'bulk',
          before: beforeState,
          after: [],
          timestamp: Date.now()
        });
      }

      // Save changes
      await saveBulkChanges(minRow, maxRow);
    }

    function copySelection() {
      if (!selection.value) return;

      const { start, end } = selection.value;
      const minRow = Math.min(start.row, end.row);
      const maxRow = Math.max(start.row, end.row);
      const minCol = Math.min(start.col, end.col);
      const maxCol = Math.max(start.col, end.col);

      const data: string[][] = [];

      for (let r = minRow; r <= maxRow; r++) {
        const rowData: string[] = [];
        for (let c = minCol; c <= maxCol; c++) {
          const row = displayRows.value[r];
          const col = columns.value[c];
          rowData.push(getCellValue(row as StatementRow, col.key) || '');
        }
        data.push(rowData);
      }

      clipboardData.value = data;
      cutMode.value = false;

      // Also copy to system clipboard as TSV
      const tsvData = data.map(row => row.join('\t')).join('\n');
      navigator.clipboard.writeText(tsvData).catch(console.error);
    }

    function cutSelection() {
      copySelection();
      cutMode.value = true;
    }

    async function pasteFromClipboard() {
      if (!selection.value) return;

      // Try to read from system clipboard first
      let pasteData = clipboardData.value;
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          pasteData = text.split('\n').map(row => row.split('\t'));
        }
      } catch {
        // Use internal clipboard
      }

      if (!pasteData) return;

      const startRow = selection.value.start.row;
      const startCol = selection.value.start.col;

      const beforeState: unknown[] = [];
      const afterState: unknown[] = [];

      for (let r = 0; r < pasteData.length; r++) {
        const targetRow = startRow + r;
        if (targetRow >= displayRows.value.length) break;

        for (let c = 0; c < pasteData[r].length; c++) {
          const targetCol = startCol + c;
          if (targetCol >= columns.value.length) break;

          const row = displayRows.value[targetRow];
          const col = columns.value[targetCol];
          const oldValue = getCellValue(row as StatementRow, col.key);
          const newValue = pasteData[r][c] || null;

          if (row.id) {
            beforeState.push({ rowId: row.id, key: col.key, value: oldValue });
            afterState.push({ rowId: row.id, key: col.key, value: newValue });
          }

          (row as Record<string, unknown>)[col.key] = newValue;
        }
      }

      if (beforeState.length > 0) {
        pushUndo({
          type: 'bulk',
          before: beforeState,
          after: afterState,
          timestamp: Date.now()
        });
      }

      // If cut mode, clear the original cells
      if (cutMode.value) {
        cutMode.value = false;
        // Original cells would have been cleared on cut
      }

      // Save changes
      await saveBulkChanges(startRow, startRow + pasteData.length - 1);
    }

    async function saveBulkChanges(minRow: number, maxRow: number) {
      saving.value = true;
      try {
        const rowsToUpdate: Partial<StatementRow>[] = [];
        const emptyRowIds: number[] = [];

        const dataColumnKeys = ['propertyId', 'propertyLabel', 'mandatory', 'repeatable',
                                'valueNodeType', 'valueDataType', 'valueShape', 'valueConstraint',
                                'valueConstraintType', 'note', 'lcDefaultLiteral', 'lcDefaultURI',
                                'lcDataTypeURI', 'lcRemark'];

        for (let r = minRow; r <= maxRow; r++) {
          const row = displayRows.value[r];
          if (!row.id) continue;

          // Check if row is now empty
          const isRowEmpty = dataColumnKeys.every(k => {
            const v = (row as Record<string, unknown>)[k];
            return v === null || v === undefined || v === '';
          });

          if (isRowEmpty) {
            emptyRowIds.push(row.id as number);
          } else {
            rowsToUpdate.push({
              id: row.id,
              propertyId: row.propertyId,
              propertyLabel: row.propertyLabel,
              mandatory: row.mandatory,
              repeatable: row.repeatable,
              valueNodeType: row.valueNodeType,
              valueDataType: row.valueDataType,
              valueShape: row.valueShape,
              valueConstraint: row.valueConstraint,
              valueConstraintType: row.valueConstraintType,
              note: row.note,
              lcDataTypeURI: row.lcDataTypeURI
            });
          }
        }

        if (rowsToUpdate.length > 0) {
          await rowApi.bulkUpdate(props.workspaceId, props.shapeId, rowsToUpdate);
        }

        // Delete empty rows
        if (emptyRowIds.length > 0) {
          console.log('Deleting empty rows after bulk change:', emptyRowIds);
          await rowApi.bulkDelete(props.workspaceId, props.shapeId, emptyRowIds);
          rows.value = rows.value.filter(r => !emptyRowIds.includes(r.id));
        }
      } catch (e) {
        console.error('Failed to save bulk changes:', e);
      } finally {
        saving.value = false;
      }
    }

    // Row operations
    async function insertRowAbove() {
      contextMenu.value.visible = false;
      if (!selection.value) return;

      const insertAt = selection.value.start.row;
      await insertRowAt(insertAt);
    }

    async function insertRowBelow() {
      contextMenu.value.visible = false;
      if (!selection.value) return;

      const insertAt = selection.value.end.row + 1;
      await insertRowAt(insertAt);
    }

    async function insertRowAt(index: number) {
      // Shift all subsequent rows
      for (let i = index; i < rows.value.length; i++) {
        rows.value[i].rowOrder = i + 1;
      }

      const newRow = await rowApi.create(props.workspaceId, props.shapeId, {
        rowOrder: index
      });

      rows.value.splice(index, 0, newRow);

      pushUndo({
        type: 'row_add',
        before: null,
        after: { rowId: newRow.id, index },
        rowId: newRow.id,
        timestamp: Date.now()
      });
    }

    async function deleteSelectedRows() {
      contextMenu.value.visible = false;
      if (!selection.value) return;

      const minRow = Math.min(selection.value.start.row, selection.value.end.row);
      const maxRow = Math.max(selection.value.start.row, selection.value.end.row);

      const rowIdsToDelete: number[] = [];
      const rowsBeforeDelete: StatementRow[] = [];

      for (let r = minRow; r <= maxRow; r++) {
        const row = displayRows.value[r];
        if (row.id) {
          rowIdsToDelete.push(row.id as number);
          rowsBeforeDelete.push({ ...row } as StatementRow);
        }
      }

      if (rowIdsToDelete.length === 0) return;

      pushUndo({
        type: 'row_delete',
        before: rowsBeforeDelete,
        after: null,
        timestamp: Date.now()
      });

      await rowApi.bulkDelete(props.workspaceId, props.shapeId, rowIdsToDelete);

      // Remove from local state
      rows.value = rows.value.filter(r => !rowIdsToDelete.includes(r.id));

      // Clear selection
      selection.value = null;
    }

    // Context menu
    function showContextMenu(x: number, y: number) {
      contextMenu.value = { visible: true, x, y };
    }

    function hideContextMenu() {
      contextMenu.value.visible = false;
    }

    // Error tooltip functions
    function showErrorTooltip(row: Partial<StatementRow>, key: string, rowIndex: number, colIndex: number, event: MouseEvent) {
      // Don't show tooltip if cell is being edited
      if (editingCell.value?.row === rowIndex && editingCell.value?.col === colIndex) {
        errorTooltip.value.visible = false;
        return;
      }

      const error = getCellError(row, key);
      if (!error) {
        errorTooltip.value.visible = false;
        return;
      }

      const rect = (event.target as HTMLElement).getBoundingClientRect();
      errorTooltip.value = {
        visible: true,
        x: rect.left,
        y: rect.bottom + 4,
        message: error
      };
    }

    function hideErrorTooltip() {
      errorTooltip.value.visible = false;
    }

    // Undo/Redo
    function pushUndo(state: UndoState) {
      undoStack.value.push(state);
      redoStack.value = []; // Clear redo stack on new action
    }

    async function undo() {
      const state = undoStack.value.pop();
      if (!state) return;

      redoStack.value.push(state);

      if (state.type === 'cell') {
        const { rowIndex, key, value, rowId } = state.before as { rowIndex: number; key: string; value: string | null; rowId: number };
        const row = rows.value.find(r => r.id === rowId);
        if (row) {
          (row as Record<string, unknown>)[key] = value;
          await rowApi.update(props.workspaceId, props.shapeId, rowId, { [key]: value });
        }
      }
      // Handle other undo types...
    }

    async function redo() {
      const state = redoStack.value.pop();
      if (!state) return;

      undoStack.value.push(state);

      if (state.type === 'cell') {
        const { rowIndex, key, value, rowId } = state.after as { rowIndex: number; key: string; value: string | null; rowId: number };
        const row = rows.value.find(r => r.id === rowId);
        if (row) {
          (row as Record<string, unknown>)[key] = value;
          await rowApi.update(props.workspaceId, props.shapeId, rowId, { [key]: value });
        }
      }
      // Handle other redo types...
    }

    function startEditDescription() {
      const newDescription = prompt('Enter shape description:', props.description || '');
      if (newDescription !== null && newDescription !== props.description) {
        emit('description-change', newDescription || null);
      }
    }

    // Send to workspace functions
    async function openSendToWorkspace() {
      showSendToWorkspace.value = true;
      selectedTargetWorkspace.value = null;
      shapeExistsInTarget.value = false;
      loadingWorkspaces.value = true;
      try {
        allWorkspaces.value = await workspaceApi.list();
      } catch (e) {
        console.error('Failed to load workspaces:', e);
        alert('Failed to load workspaces');
        showSendToWorkspace.value = false;
      } finally {
        loadingWorkspaces.value = false;
      }
    }

    function closeSendToWorkspace() {
      showSendToWorkspace.value = false;
      selectedTargetWorkspace.value = null;
      shapeExistsInTarget.value = false;
    }

    async function checkShapeExists() {
      if (!selectedTargetWorkspace.value) {
        shapeExistsInTarget.value = false;
        return;
      }
      try {
        shapeExistsInTarget.value = await shapeApi.existsInWorkspace(
          props.workspaceId,
          props.shapeId,
          selectedTargetWorkspace.value
        );
      } catch (e) {
        console.error('Failed to check if shape exists:', e);
        shapeExistsInTarget.value = false;
      }
    }

    async function doSendToWorkspace() {
      if (!selectedTargetWorkspace.value) return;

      sendingShape.value = true;
      try {
        const result = await shapeApi.copyToWorkspace(
          props.workspaceId,
          props.shapeId,
          selectedTargetWorkspace.value
        );
        const targetWorkspace = otherWorkspaces.value.find(ws => ws.id === selectedTargetWorkspace.value);
        const workspaceName = targetWorkspace?.name || 'the selected workspace';
        alert(`Shape "${props.shapeId}" sent to ${workspaceName} successfully. ${result.rowsCopied} rows copied.${result.overwrote ? ' (overwrote existing shape)' : ''}`);
        closeSendToWorkspace();
      } catch (e) {
        alert(`Failed to send shape: ${(e as Error).message}`);
      } finally {
        sendingShape.value = false;
      }
    }

    // Watch for shape changes
    watch(() => props.shapeId, () => {
      loadRows();
      selection.value = null;
      editingCell.value = null;
      undoStack.value = [];
      redoStack.value = [];
    });

    // Global mouse up handler
    onMounted(() => {
      loadRows();
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('click', (e) => {
        if (!(e.target as HTMLElement).closest('.context-menu')) {
          hideContextMenu();
        }
      });
    });

    return {
      containerRef,
      gridWrapper,
      columns,
      displayRows,
      loading,
      saving,
      hasUnsavedChanges,
      showSavedIndicator,
      selection,
      editingCell,
      contextMenu,
      errorTooltip,
      canUndo,
      canRedo,
      dragOverRowIndex,
      getCellValue,
      formatCellValue,
      hasMultipleValues,
      getMultilineValues,
      getCellClass,
      getCellError,
      isCellDisabled,
      isInSelection,
      isRowSelected,
      selectRow,
      isEditing,
      handleMouseDown,
      handleMouseOver,
      handleKeyDown,
      handleDragStart,
      handleDragEnd,
      handleDragOver,
      handleDrop,
      startEditing,
      finishEditing,
      cancelEditing,
      handleInlineCheckbox,
      handleInlineDropdown,
      updateCell,
      copySelection,
      cutSelection,
      pasteFromClipboard,
      insertRowAbove,
      insertRowBelow,
      deleteSelectedRows,
      undo,
      redo,
      startEditDescription,
      showErrorTooltip,
      hideErrorTooltip,
      // Send to workspace
      showSendToWorkspace,
      otherWorkspaces,
      loadingWorkspaces,
      selectedTargetWorkspace,
      shapeExistsInTarget,
      sendingShape,
      openSendToWorkspace,
      closeSendToWorkspace,
      checkShapeExists,
      doSendToWorkspace
    };
  }
});
</script>

<style scoped>
.spreadsheet-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  outline: none;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 1rem;
  background: white;
  border-bottom: 1px solid #e0e0e0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.shape-id {
  font-weight: 600;
  color: #2c3e50;
}

.shape-description {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.85rem;
  color: #555;
  cursor: pointer;
  max-width: 400px;
}

.shape-description:hover {
  background: #f0f0f0;
}

.shape-description.no-description {
  color: #999;
  font-style: italic;
}

.shape-description .description-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shape-description .edit-icon {
  opacity: 0;
  font-size: 0.75rem;
  transition: opacity 0.15s;
}

.shape-description:hover .edit-icon {
  opacity: 1;
}

.save-indicator {
  font-size: 0.85rem;
  padding: 2px 8px;
  border-radius: 4px;
}

.save-indicator.saving {
  color: #3498db;
  background: #e3f2fd;
}

.save-indicator.saved {
  color: #27ae60;
  background: #e8f5e9;
}

.save-indicator.unsaved {
  color: #e67e22;
  background: #fff3e0;
}

.locked-indicator {
  display: inline-block;
  background: #f39c12;
  color: white;
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  border-radius: 3px;
  font-weight: 600;
}

.shape-description-readonly {
  color: #666;
  font-size: 0.9rem;
  font-style: italic;
}

.toolbar-right {
  display: flex;
  gap: 0.5rem;
}

.btn-icon {
  width: 32px;
  height: 32px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 1rem;
}

.btn-icon:hover:not(:disabled) {
  background: #f0f0f0;
}

.btn-icon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.grid-wrapper {
  flex: 1;
  overflow: auto;
  background: white;
}

.grid {
  border-collapse: collapse;
  table-layout: fixed;
}

.row-number-header,
.row-number {
  width: 50px;
  min-width: 50px;
  background: #f5f5f5;
  text-align: center;
  color: #666;
  font-size: 0.85rem;
  border: 1px solid #e0e0e0;
  user-select: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.row-number:hover {
  background: #e8e8e8;
}

.row-number.row-selected {
  background: #bbdefb;
  color: #1565c0;
  font-weight: 600;
}

.drag-handle {
  cursor: grab;
  color: #999;
  font-size: 12px;
}

.drag-handle:hover {
  color: #666;
}

.row-num {
  min-width: 20px;
}

tr.dragging {
  opacity: 0.5;
}

tr.drag-over {
  border-top: 2px solid #2196f3;
}

tr.row-selected td {
  background: #e3f2fd;
}

.column-header {
  background: #f5f5f5;
  border: 1px solid #e0e0e0;
  padding: 0.5rem;
  font-weight: 600;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: none;
}

.cell {
  border: 1px solid #e0e0e0;
  padding: 0;
  height: 28px;
  min-height: 28px;
  position: relative;
  overflow: visible;
}

.cell.selected {
  background: #e3f2fd;
}

.cell.active {
  outline: 2px solid #2196f3;
  outline-offset: -1px;
}

.cell.editing {
  padding: 0;
  z-index: 10;
  overflow: visible;
}


.cell.has-cell-error {
  background: #ffebee;
}

.cell.has-cell-error::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  border-style: solid;
  border-width: 0 8px 8px 0;
  border-color: transparent #e74c3c transparent transparent;
}

.cell-content {
  display: block;
  padding: 4px 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cell-content.multiline-content {
  display: flex;
  flex-direction: column;
  white-space: normal;
  overflow: hidden;
}

.multiline-value {
  display: block;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.multiline-value:not(:last-child) {
  border-bottom: 1px dotted #ddd;
}

.cell-content.disabled {
  color: #999;
  background: #f9f9f9;
}

.inline-checkbox {
  display: block;
  margin: 6px auto;
  cursor: pointer;
}

.inline-checkbox:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.inline-dropdown {
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
  padding: 4px 8px;
  font-size: inherit;
  font-family: inherit;
  cursor: pointer;
  outline: none;
}

.inline-dropdown:disabled {
  cursor: not-allowed;
  opacity: 0.5;
  background: #f9f9f9;
}

.has-errors {
  background: rgba(231, 76, 60, 0.05);
}

.context-menu {
  position: fixed;
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  min-width: 150px;
}

.context-menu button {
  display: block;
  width: 100%;
  padding: 0.5rem 1rem;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
}

.context-menu button:hover {
  background: #f0f0f0;
}

.context-menu hr {
  margin: 0.25rem 0;
  border: none;
  border-top: 1px solid #e0e0e0;
}

.error-tooltip {
  position: fixed;
  background: #c0392b;
  color: white;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 0.85rem;
  max-width: 300px;
  z-index: 1001;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  pointer-events: none;
}

.error-tooltip::before {
  content: '';
  position: absolute;
  top: -6px;
  left: 12px;
  border-width: 0 6px 6px 6px;
  border-style: solid;
  border-color: transparent transparent #c0392b transparent;
}

/* Dialog/Modal styles */
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
  margin: 0 0 0.5rem 0;
  color: #2c3e50;
}

.dialog-description {
  color: #666;
  margin-bottom: 1rem;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  font-weight: 500;
  transition: background-color 0.2s;
  cursor: pointer;
}

.btn-primary {
  background-color: #3498db;
  color: white;
}

.btn-primary:hover:not(:disabled) {
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

/* Send to workspace dialog specific styles */
.send-to-workspace-dialog {
  min-width: 450px;
}

.loading-workspaces,
.no-workspaces {
  padding: 1rem;
  text-align: center;
  color: #666;
  background: #f8f9fa;
  border-radius: 4px;
}

.workspace-list {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
}

.workspace-option {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  cursor: pointer;
  border-bottom: 1px solid #f0f0f0;
  transition: background-color 0.15s;
}

.workspace-option:last-child {
  border-bottom: none;
}

.workspace-option:hover {
  background: #f8f9fa;
}

.workspace-option.selected {
  background: #e3f2fd;
}

.workspace-option input[type="radio"] {
  margin: 0;
  cursor: pointer;
}

.workspace-name {
  font-weight: 500;
  color: #2c3e50;
}

.warning-message {
  margin-top: 1rem;
  padding: 0.75rem;
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 4px;
  color: #856404;
  font-size: 0.9rem;
}
</style>
