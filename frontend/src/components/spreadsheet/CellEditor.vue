<template>
  <div class="cell-editor" :class="{ disabled }">
    <!-- Checkbox editor -->
    <template v-if="column.editorType === 'checkbox'">
      <input
        type="checkbox"
        :checked="value === 'true' || value === '1'"
        :disabled="disabled"
        @change="handleCheckboxChange"
        @blur="handleBlur"
        @keydown.escape="handleCancel"
        ref="inputRef"
      />
    </template>

    <!-- Dropdown editor -->
    <template v-else-if="column.editorType === 'dropdown'">
      <select
        :value="value || ''"
        :disabled="disabled"
        @change="handleSelectChange"
        @blur="handleBlur"
        @keydown.escape="handleCancel"
        ref="inputRef"
      >
        <option value=""></option>
        <option v-for="opt in column.options" :key="opt" :value="opt">
          {{ opt }}
        </option>
      </select>
    </template>

    <!-- Typeahead editor -->
    <template v-else-if="column.editorType === 'typeahead'">
      <div class="typeahead-wrapper">
        <input
          type="text"
          :value="localValue"
          :disabled="disabled"
          @input="handleTypeaheadInput"
          @blur="handleTypeaheadBlur"
          @keydown="handleTypeaheadKeyDown"
          ref="inputRef"
        />
        <div
          v-if="showSuggestions && suggestions.length > 0"
          class="suggestions"
        >
          <div
            v-for="(suggestion, index) in suggestions"
            :key="suggestion"
            class="suggestion"
            :class="{ active: selectedSuggestionIndex === index }"
            @mousedown.prevent="selectSuggestion(suggestion)"
          >
            {{ suggestion }}
          </div>
        </div>
      </div>
    </template>

    <!-- Multiline editor -->
    <template v-else-if="column.editorType === 'multiline'">
      <textarea
        :value="multilineValue"
        :disabled="disabled"
        @input="handleMultilineInput"
        @blur="handleMultilineBlur"
        @keydown="handleMultilineKeyDown"
        ref="textareaRef"
        rows="6"
      ></textarea>
    </template>

    <!-- Multiline typeahead editor (for valueShape) -->
    <template v-else-if="column.editorType === 'multiline-typeahead'">
      <div class="multiline-typeahead-wrapper">
        <textarea
          :value="multilineValue"
          :disabled="disabled"
          @input="handleMultilineTypeaheadInput"
          @blur="handleMultilineTypeaheadBlur"
          @keydown="handleMultilineTypeaheadKeyDown"
          ref="textareaRef"
          rows="6"
        ></textarea>
        <div
          v-if="showSuggestions && suggestions.length > 0"
          class="suggestions"
        >
          <div
            v-for="(suggestion, index) in suggestions"
            :key="suggestion"
            class="suggestion"
            :class="{ active: selectedSuggestionIndex === index }"
            @mousedown.prevent="selectMultilineSuggestion(suggestion)"
          >
            {{ suggestion }}
          </div>
        </div>
      </div>
    </template>

    <!-- Text editor (default) -->
    <template v-else>
      <input
        type="text"
        :value="localValue"
        :disabled="disabled"
        @input="handleTextInput"
        @blur="handleBlur"
        @keydown="handleTextKeyDown"
        ref="inputRef"
      />
    </template>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted, watch, nextTick, PropType } from 'vue';
import type { ColumnDef, Shape, Namespace } from '@/types';

export default defineComponent({
  name: 'CellEditor',
  props: {
    column: {
      type: Object as PropType<ColumnDef>,
      required: true
    },
    value: {
      type: String as PropType<string | null>,
      default: null
    },
    shapes: {
      type: Array as PropType<Shape[]>,
      default: () => []
    },
    namespaces: {
      type: Array as PropType<Namespace[]>,
      default: () => []
    },
    currentShapeId: {
      type: String,
      default: ''
    },
    disabled: {
      type: Boolean,
      default: false
    }
  },
  emits: ['update', 'blur', 'cancel'],
  setup(props, { emit }) {
    const inputRef = ref<HTMLInputElement | HTMLSelectElement | null>(null);
    const textareaRef = ref<HTMLTextAreaElement | null>(null);
    const localValue = ref(props.value || '');
    const showSuggestions = ref(false);
    const suggestions = ref<string[]>([]);
    const selectedSuggestionIndex = ref(-1);
    const isCommitting = ref(false);

    // Convert comma/pipe separated values to newlines for display in textarea
    const multilineValue = computed(() => {
      if (!localValue.value) return '';
      return localValue.value.replace(/[,|]/g, '\n');
    });

    // Focus input on mount
    onMounted(() => {
      nextTick(() => {
        if (props.column.editorType === 'multiline' || props.column.editorType === 'multiline-typeahead') {
          textareaRef.value?.focus();
          textareaRef.value?.select();
        } else {
          inputRef.value?.focus();
          if (inputRef.value instanceof HTMLInputElement && props.column.editorType !== 'checkbox') {
            inputRef.value.select();
          }
        }
      });
    });

    // Update local value when prop changes
    watch(() => props.value, (newVal) => {
      localValue.value = newVal || '';
    });

    function handleCheckboxChange(event: Event) {
      const target = event.target as HTMLInputElement;
      emit('update', target.checked ? 'true' : 'false');
    }

    function handleSelectChange(event: Event) {
      const target = event.target as HTMLSelectElement;
      emit('update', target.value || null);
    }

    function handleTextInput(event: Event) {
      const target = event.target as HTMLInputElement;
      localValue.value = target.value;
    }

    function commitAndClose() {
      console.log('commitAndClose called, isCommitting:', isCommitting.value, 'localValue:', localValue.value, 'props.value:', props.value);
      if (isCommitting.value) return;
      isCommitting.value = true;
      if (localValue.value !== props.value) {
        console.log('emitting update with value:', localValue.value || null);
        emit('update', localValue.value || null);
      }
      console.log('emitting blur');
      emit('blur');
    }

    function handleBlur() {
      console.log('handleBlur called');
      commitAndClose();
    }

    function handleTextKeyDown(event: KeyboardEvent) {
      console.log('handleTextKeyDown called, key:', event.key);
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        commitAndClose();
      } else if (event.key === 'Escape') {
        handleCancel();
      } else if (event.key === 'Tab') {
        // Let blur handle it
      }
    }

    function handleCancel() {
      localValue.value = props.value || '';
      emit('cancel');
    }

    // Multiline (textarea) handlers
    function handleMultilineInput(event: Event) {
      const target = event.target as HTMLTextAreaElement;
      // Convert newlines back to pipe for storage
      localValue.value = target.value.split('\n').map(s => s.trim()).filter(s => s).join('|');
    }

    function handleMultilineBlur() {
      commitAndClose();
    }

    function handleMultilineKeyDown(event: KeyboardEvent) {
      // Escape to cancel, Cmd/Ctrl+Enter to confirm
      if (event.key === 'Escape') {
        handleCancel();
      } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        commitAndClose();
      }
      // Regular Enter adds a new line (default behavior)
    }

    // Multiline typeahead handlers (for valueShape - multiple shapes with autocomplete)
    function handleMultilineTypeaheadInput(event: Event) {
      const target = event.target as HTMLTextAreaElement;
      // Convert newlines back to pipe for storage
      localValue.value = target.value.split('\n').map(s => s.trim()).filter(s => s).join('|');
      updateMultilineSuggestions(target.value);
    }

    function updateMultilineSuggestions(textareaValue: string) {
      // Get the current line being edited (last line)
      const lines = textareaValue.split('\n');
      const currentLine = lines[lines.length - 1].trim().toLowerCase();

      if (props.column.key === 'valueShape' && currentLine) {
        // Suggest existing shapes, excluding the current shape
        suggestions.value = props.shapes
          .map(s => s.shapeId)
          .filter(id => id !== props.currentShapeId && id.toLowerCase().includes(currentLine))
          .slice(0, 10);
      } else {
        suggestions.value = [];
      }

      showSuggestions.value = suggestions.value.length > 0;
      selectedSuggestionIndex.value = -1;
    }

    function handleMultilineTypeaheadBlur(event: FocusEvent) {
      const relatedTarget = event.relatedTarget as HTMLElement | null;
      if (relatedTarget?.closest('.suggestions')) {
        return;
      }
      showSuggestions.value = false;
      commitAndClose();
    }

    function handleMultilineTypeaheadKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        showSuggestions.value = false;
        handleCancel();
        return;
      }

      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        showSuggestions.value = false;
        commitAndClose();
        return;
      }

      if (!showSuggestions.value) return;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          selectedSuggestionIndex.value = Math.min(
            selectedSuggestionIndex.value + 1,
            suggestions.value.length - 1
          );
          break;
        case 'ArrowUp':
          event.preventDefault();
          selectedSuggestionIndex.value = Math.max(selectedSuggestionIndex.value - 1, -1);
          break;
        case 'Tab':
        case 'Enter':
          if (selectedSuggestionIndex.value >= 0) {
            event.preventDefault();
            selectMultilineSuggestion(suggestions.value[selectedSuggestionIndex.value]);
          }
          break;
      }
    }

    function selectMultilineSuggestion(suggestion: string) {
      // Replace the current line with the suggestion
      const lines = localValue.value.split('|');
      lines[lines.length - 1] = suggestion;
      localValue.value = lines.join('|');
      showSuggestions.value = false;
      selectedSuggestionIndex.value = -1;

      // Keep focus on textarea
      nextTick(() => {
        textareaRef.value?.focus();
      });
    }

    // Typeahead logic
    function handleTypeaheadInput(event: Event) {
      const target = event.target as HTMLInputElement;
      localValue.value = target.value;
      updateSuggestions();
    }

    function updateSuggestions() {
      const query = localValue.value.toLowerCase();

      if (props.column.key === 'propertyId' || props.column.key === 'resourceURI' || props.column.key === 'lcDataTypeURI') {
        // Suggest namespace prefixes
        const colonIndex = localValue.value.indexOf(':');
        if (colonIndex === -1) {
          // Suggest prefixes
          suggestions.value = props.namespaces
            .map(ns => ns.prefix + ':')
            .filter(prefix => prefix.toLowerCase().startsWith(query))
            .slice(0, 10);
        } else {
          // Already has prefix, no suggestions
          suggestions.value = [];
        }
      } else if (props.column.key === 'valueShape') {
        // Suggest existing shapes, excluding the current shape (to prevent recursion)
        suggestions.value = props.shapes
          .map(s => s.shapeId)
          .filter(id => id !== props.currentShapeId && id.toLowerCase().includes(query))
          .slice(0, 10);
      } else {
        suggestions.value = [];
      }

      showSuggestions.value = suggestions.value.length > 0;
      selectedSuggestionIndex.value = -1;
    }

    function handleTypeaheadKeyDown(event: KeyboardEvent) {
      console.log('handleTypeaheadKeyDown called, key:', event.key, 'showSuggestions:', showSuggestions.value);

      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        if (showSuggestions.value && selectedSuggestionIndex.value >= 0) {
          selectSuggestion(suggestions.value[selectedSuggestionIndex.value]);
        } else {
          // Blur the input to trigger close
          inputRef.value?.blur();
        }
        return;
      }

      if (event.key === 'Escape') {
        showSuggestions.value = false;
        handleCancel();
        return;
      }

      if (!showSuggestions.value) return;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          selectedSuggestionIndex.value = Math.min(
            selectedSuggestionIndex.value + 1,
            suggestions.value.length - 1
          );
          break;
        case 'ArrowUp':
          event.preventDefault();
          selectedSuggestionIndex.value = Math.max(selectedSuggestionIndex.value - 1, -1);
          break;
        case 'Tab':
          if (selectedSuggestionIndex.value >= 0) {
            event.preventDefault();
            selectSuggestion(suggestions.value[selectedSuggestionIndex.value]);
          }
          break;
      }
    }

    function selectSuggestion(suggestion: string) {
      localValue.value = suggestion;
      showSuggestions.value = false;

      // For prefix suggestions (ending with :), keep editing so user can finish the property name
      if ((props.column.key === 'propertyId' || props.column.key === 'resourceURI' || props.column.key === 'lcDataTypeURI') && suggestion.endsWith(':')) {
        // Don't blur, let user continue typing
        nextTick(() => {
          inputRef.value?.focus();
          // Move cursor to end
          if (inputRef.value instanceof HTMLInputElement) {
            inputRef.value.setSelectionRange(suggestion.length, suggestion.length);
          }
        });
        return;
      }

      if (isCommitting.value) return;
      isCommitting.value = true;
      emit('update', localValue.value);
      emit('blur');
    }

    function handleTypeaheadBlur(event: FocusEvent) {
      console.log('handleTypeaheadBlur called');
      // Check if we're clicking on a suggestion (relatedTarget will be within suggestions)
      const relatedTarget = event.relatedTarget as HTMLElement | null;
      if (relatedTarget?.closest('.suggestions')) {
        // Don't blur if clicking a suggestion
        return;
      }

      showSuggestions.value = false;
      commitAndClose();
    }

    return {
      inputRef,
      textareaRef,
      localValue,
      multilineValue,
      showSuggestions,
      suggestions,
      selectedSuggestionIndex,
      handleCheckboxChange,
      handleSelectChange,
      handleTextInput,
      handleBlur,
      handleTextKeyDown,
      handleCancel,
      handleMultilineInput,
      handleMultilineBlur,
      handleMultilineKeyDown,
      handleMultilineTypeaheadInput,
      handleMultilineTypeaheadBlur,
      handleMultilineTypeaheadKeyDown,
      selectMultilineSuggestion,
      handleTypeaheadInput,
      handleTypeaheadKeyDown,
      handleTypeaheadBlur,
      selectSuggestion
    };
  }
});
</script>

<style scoped>
.cell-editor {
  width: 100%;
  height: 100%;
  min-height: 28px;
  display: flex;
  align-items: stretch;
}

.cell-editor.disabled {
  pointer-events: none;
  opacity: 0.6;
}

.cell-editor input[type="text"],
.cell-editor select {
  width: 100%;
  min-width: 100%;
  height: 100%;
  min-height: 28px;
  border: none;
  padding: 6px 8px;
  font-size: inherit;
  font-family: inherit;
  background: white;
  outline: none;
  box-sizing: border-box;
}

.cell-editor select {
  cursor: pointer;
  appearance: auto;
}

.cell-editor input[type="checkbox"] {
  margin: 6px;
}

.cell-editor textarea {
  width: 100%;
  min-width: 150px;
  min-height: 120px;
  border: 1px solid #2196f3;
  padding: 6px 8px;
  font-size: inherit;
  font-family: inherit;
  background: white;
  outline: none;
  box-sizing: border-box;
  resize: both;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 100;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.typeahead-wrapper,
.multiline-typeahead-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 28px;
}

.typeahead-wrapper input {
  width: 100%;
  height: 100%;
  min-height: 28px;
  border: none;
  padding: 6px 8px;
  font-size: inherit;
  font-family: inherit;
  background: white;
  outline: none;
  box-sizing: border-box;
}

.suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  min-width: 200px;
  background: white;
  border: 1px solid #ddd;
  border-top: none;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  max-height: 200px;
  overflow-y: auto;
  z-index: 1000;
}

.suggestion {
  padding: 0.5rem;
  cursor: pointer;
}

.suggestion:hover,
.suggestion.active {
  background: #e3f2fd;
}
</style>
