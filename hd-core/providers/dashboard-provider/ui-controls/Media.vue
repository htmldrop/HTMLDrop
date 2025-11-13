<template>
  <div class="drop-control-media" :class="{'drop-control-media--large': large}" @click="select = true">
    <template v-if="isImage">
      <img :src="fileUrl" :alt="file.original_name" />
    </template>

    <template v-else-if="isAudio">
      <audio :src="fileUrl" controls></audio>
    </template>

    <template v-else-if="isVideo">
      <video :src="fileUrl" controls></video>
    </template>

    <template v-else-if="isSvg">
      <img :src="fileUrl" :alt="file.original_name" />
    </template>

    <template v-else>
      <button>
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path fill-rule="evenodd" clip-rule="evenodd" d="M3 22h18a1 1 0 0 0 1-1v-4l-4.293-4.293a1 1 0 0 0-1.414 0L10.5 18.5a.707.707 0 0 1-1-1L11 16l-2.293-2.293a1 1 0 0 0-1.414 0L2 19v2a1 1 0 0 0 1 1m18 2H3a3 3 0 0 1-3-3V3a3 3 0 0 1 3-3h18a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5" fill="currentColor"/>
        </svg>
      </button>
    </template>

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
        :multi="false"
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
    selected: []
  }),
  computed: {
    isImage() { return this.file?.mime_type?.startsWith('image/') && !this.isSvg },
    isAudio() { return this.file?.mime_type?.startsWith('audio/') },
    isVideo() { return this.file?.mime_type?.startsWith('video/') },
    isSvg() { return this.file?.mime_type === 'image/svg+xml' },
    fileUrl() { return this.file?.path ? `${this.apiBase}/uploads/${this.file.path}` : '' }
  },
  async created() { await this.getFile() },
  watch: {
    async modelValue() {
      await this.getFile()
    },
    async item() {
      await this.getFile()
    },
    async field() {
      await this.getFile()
    },
    selected() {
      let file = this.selected?.[0]
      if (file) {
        this.$emit('update:modelValue', file)
        this.file = file
      } else {
        this.$emit('update:modelValue', {})
        this.file = {}
      }
    }
  },
  methods: {
    async getFile() {
      if (!this.modelValue) return
      try {
        let file = this.modelValue
        if (typeof file === 'string') file = JSON.parse(file)
        this.file = file
        this.selected = [this.file]
      } catch(e) { console.log(e) }
    }
  }
}
</script>

<style>
.drop-control-media.drop-control-media--large, .drop-control-media--large.drop-control-media button {
  width: 120px;
  height: 120px;
}
.drop-control-media, .drop-control-media button {
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
}
.drop-control-media img,
.drop-control-media audio,
.drop-control-media video {
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
</style>
