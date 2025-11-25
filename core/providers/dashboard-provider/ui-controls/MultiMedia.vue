<template>
  <div class="drop-control-multimedia" :class="{'drop-control-multimedia--large': large}" @click="select = true">

    <template v-if="!selected.length">
      <button>
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path fill-rule="evenodd" clip-rule="evenodd" d="M3 22h18a1 1 0 0 0 1-1v-4l-4.293-4.293a1 1 0 0 0-1.414 0L10.5 18.5a.707.707 0 0 1-1-1L11 16l-2.293-2.293a1 1 0 0 0-1.414 0L2 19v2a1 1 0 0 0 1 1m18 2H3a3 3 0 0 1-3-3V3a3 3 0 0 1 3-3h18a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5" fill="currentColor"/>
        </svg>
      </button>
    </template>
    
    <div
      v-for="(file, index) in selected"
      :key="file.attachment_id || index"
      draggable="true"
      :class="{
        'is-dragging': draggingIndex === index || touchDragIndex === index, 
        'drag-over': dragOverIndex === index
      }"
      
      @dragstart="handleDragStart($event, index)"
      @dragenter.prevent="handleDragEnter($event, index)"
      @dragleave.prevent="handleDragLeave($event, index)"
      @dragover.prevent 
      @drop.prevent="handleDrop($event, index)"
      
      @touchstart.stop="handleTouchStart($event, index)"
      @touchmove.prevent="handleTouchMove($event)"
      @touchend.prevent="handleTouchEnd"
    >
      <template v-if="isImage(file)">
        <img :src="fileUrl(file)" :alt="file.original_name" />
      </template>

      <template v-else-if="isAudio(file)">
        <audio :src="fileUrl(file)" controls></audio>
      </template>

      <template v-else-if="isVideo(file)">
        <video :src="fileUrl(file)" controls></video>
      </template>

      <template v-else-if="isSvg(file)">
        <img :src="fileUrl(file)" :alt="file.original_name" />
      </template>
    </div>

    <teleport to="body">
      <component
        v-if="select"
        v-model="selected"
        :is="getControl('mediaselector')"
        :postType="postType"
        :field="field"
        :priority="priority"
        :source="source"
        :item="item"
        :multi="true"
        @close="select=false"
      />
    </teleport>
  </div>
</template>

<script>
export default {
  inject: ['translate', 'apiBase', 'apiFetch', 'controls', 'getControl'],
  props: ['modelValue', 'field', 'priority', 'source', 'item', 'postType', 'large'],
  emits: ['update:modelValue'],
  data: () => ({
    file: { filename: '', original_name: '', mime_type: '', size: 0, path: '', attachment_id: 0 },
    progress: 0,
    select: false,
    selected: [],
    
    // Drag and Drop State
    draggingIndex: null, // For mouse drag
    dragOverIndex: null, // For mouse drag
    
    // Touch Drag State (Simplified)
    touchDragIndex: null, // Index of the element being touched/dragged
    touchTargetEl: null,  // Reference to the actual DOM element
  }),
  async created() { await this.getFiles() },
  watch: {
    async modelValue() {
      await this.getFiles()
    },
    async item() {
      await this.getFiles()
    },
    async field() {
      await this.getFiles()
    },
    selected(arr) {
      // Emit the updated, reordered array as a JSON string
      this.$emit('update:modelValue', arr)
    }
  },
  methods: {
    /* --- Utility Methods (Original) --- */
    isImage(file) { return file?.mime_type?.startsWith('image/') && !this.isSvg(file) },
    isAudio(file) { return file?.mime_type?.startsWith('audio/') },
    isVideo(file) { return file?.mime_type?.startsWith('video/') },
    isSvg(file) { return file?.mime_type === 'image/svg+xml' },
    fileUrl(file) { return file?.path ? `${this.apiBase}/uploads/${file.path}` : '' },
    async getFiles() {
      if (!this.modelValue) return
      try {
        let files = this.modelValue
        if (typeof files === 'string') files = JSON.parse(files)
        this.selected = files || []
      } catch(e) { console.log(e) }
    },
    
    /* --- Core Reordering Logic --- */
    moveItem(fromIndex, toIndex) {
      if (fromIndex === null || toIndex === null || fromIndex === toIndex) return
      
      const item = this.selected.splice(fromIndex, 1)[0]
      this.selected.splice(toIndex, 0, item)

      this.$emit('update:modelValue', this.selected)
    },
    
    /* --- Mouse Drag and Drop Handlers --- */
    handleDragStart(event, index) {
      if (this.select) return // Do not allow drag when the media selector is open
      this.draggingIndex = index
      // Data payload is mandatory for drag to work in some browsers
      event.dataTransfer.setData('text/plain', index) 
      event.dataTransfer.effectAllowed = 'move'
    },
    
    handleDragEnter(event, index) {
      if (this.draggingIndex !== null && this.draggingIndex !== index) {
        this.dragOverIndex = index
        // Move the item immediately for a smooth, interactive feel (move-on-enter)
        this.moveItem(this.draggingIndex, index)
        this.draggingIndex = index // Update the dragging index to its new position
      }
    },
    
    handleDragLeave(event, index) {
      if (this.dragOverIndex === index) {
        this.dragOverIndex = null
      }
    },
    
    handleDrop(event, targetIndex) {
      // Reordering is complete; reset state.
      this.draggingIndex = null
      this.dragOverIndex = null
    },

    /* --- Touch Drag Handlers (Simplified Reorder) --- */
    handleTouchStart(event, index) {
      if (this.select) return
      
      this.touchDragIndex = index
      this.touchTargetEl = event.currentTarget
      // Add a class for visual feedback (e.g., lift/scale the element)
      this.touchTargetEl.classList.add('is-dragging')
    },
    
    handleTouchMove(event) {
      if (this.touchDragIndex === null) return
      
      const touch = event.touches[0]
      const container = this.$el.querySelector('.drop-control-multimedia:not(.drop-control-multimedia--large)') || this.$el
      
      // Get all child elements that are drag targets
      const children = Array.from(container.children).filter(el => el.draggable)
      
      for (let i = 0; i < children.length; i++) {
        const rect = children[i].getBoundingClientRect()
        
        // Check if the touch point is over a different element
        if (
          i !== this.touchDragIndex &&
          touch.clientX >= rect.left &&
          touch.clientX <= rect.right &&
          touch.clientY >= rect.top &&
          touch.clientY <= rect.bottom
        ) {
          // Perform reorder
          this.moveItem(this.touchDragIndex, i)
          this.touchDragIndex = i // The dragged element is now at this new index
          break // Exit after one successful swap
        }
      }
    },
    
    handleTouchEnd() {
      if (this.touchTargetEl) {
        this.touchTargetEl.classList.remove('is-dragging')
      }
      this.touchDragIndex = null
      this.touchTargetEl = null
    },
  }
}
</script>

<style>
/* --- Component Styles --- */
.drop-control-multimedia.drop-control-multimedia--large {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.drop-control-multimedia {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}
.drop-control-multimedia.drop-control-multimedia--large div, .drop-control-multimedia--large.drop-control-multimedia button {
  width: 120px;
  height: 120px;
}
.drop-control-multimedia div, .drop-control-multimedia button {
  all: unset;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent!important;
  color: var(--color-primary)!important;
  cursor: pointer;
  
  /* Required for smooth reordering transition */
  transition: transform 0.2s, opacity 0.2s, box-shadow 0.2s;
}
.drop-control-multimedia img,
.drop-control-multimedia audio,
.drop-control-multimedia video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 2px;
}
audio, video { display: block; }
.upload-progress {
  width: 100%;
  text-align: center;
  font-size: 12px;
}

/* --- Drag-and-Drop Styles --- */

/* Visual feedback for the item currently being dragged (mouse and touch) */
.drop-control-multimedia > div.is-dragging {
  opacity: 0.4; /* Make the dragged item semi-transparent */
  transform: scale(0.95); /* Subtle scale down */
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
  cursor: grabbing;
}

/* Visual feedback for the drag target */
.drop-control-multimedia > div.drag-over {
  /* You can use a border or background change here, 
     but the move-on-enter logic often makes this less necessary. */
}
</style>