<template>
  <div class="image-gallery" @pointerdown="$emit('close')">
    <transition name="fade">
      <div v-if="isDragging" class="image-gallery-droparea" @dragover.prevent @dragleave="handleDragLeave" @drop.prevent="handleDrop">
        <div class="image-gallery-droparea--border">
          {{ translate('Drop files to upload') }}
        </div>
      </div>
    </transition>
    <transition name="fade">
      <div v-if="uploading.length" class="upload-overlay" @pointerdown.stop="isUploading ? '' : closeUploadOverlay()">
        <div class="upload-overlay-content" @pointerdown.stop>
          <div class="upload-header">
            <h3>{{ translate('Uploading Files') }}</h3>

            <button v-if="isUploading" @click="cancelAllUploads" class="upload-btn upload-btn-stop">
              ✕ {{ translate('Stop') }}
            </button>

            <button v-else @click="closeUploadOverlay" class="upload-btn upload-btn-close">
              ✓ {{ translate('Close') }}
            </button>
          </div>

          <div class="upload-list">
            <div v-for="(item, i) in uploading" :key="i" class="upload-item">
              <div class="upload-info">
                <span class="upload-filename">{{ item.file.name }}</span>
                <span class="upload-status" :class="{
                  success: item.success,
                  failed: item.failed
                }">
                  <template v-if="item.success">{{ translate('Done') }}</template>
                  <template v-else-if="item.failed">{{ translate('Failed') }}</template>
                  <template v-else>{{ item.progress }}%</template>
                </span>
              </div>

              <div class="upload-progress-bar">
                <div class="upload-progress-fill" :style="{ width: item.progress + '%' }"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>
    <div class="image-gallery--wrapper" @pointerdown.stop>
      <div class="image-gallery--header">
        <h1>{{ translate('Featured image') }}</h1>
        <button @pointerdown="$emit('close')">
          <svg fill="currentColor" viewBox="0 0 15 15" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M2.64 1.27 7.5 6.13l4.84-4.84A.92.92 0 0 1 13 1a1 1 0 0 1 1 1 .9.9 0 0 1-.27.66L8.84 7.5l4.89 4.89A.9.9 0 0 1 14 13a1 1 0 0 1-1 1 .92.92 0 0 1-.69-.27L7.5 8.87l-4.85 4.85A.92.92 0 0 1 2 14a1 1 0 0 1-1-1 .9.9 0 0 1 .27-.66L6.16 7.5 1.27 2.61A.9.9 0 0 1 1 2a1 1 0 0 1 1-1c.24.003.47.1.64.27" />
          </svg>
        </button>
      </div>
      <div class="image-gallery--tabs">
        <button class="image-gallery--tab" :class="{ active: gallery.tab === 'upload' }"
          @click="gallery.tab = 'upload'">
          {{ translate('Upload files') }}
        </button>
        <button class="image-gallery--tab" :class="{ active: gallery.tab === 'browse' }"
          @click="gallery.tab = 'browse'">
          {{ translate('Media library') }}
        </button>
      </div>
      <div class="image-gallery--upload" v-if="gallery.tab === 'upload'">
        <div class="image-gallery--upload-wrapper">
          <h3>{{ translate('Drop files to upload') }}</h3>
          <span>{{ translate('eller') }}</span>
          <button @click="selectFiles">{{ translate('Select files') }}</button>
          <span>{{ translate('Max filesize for uploads') }}: 128 MB.</span>
          <input type="file" multiple ref="fileInput" style="display:none" @change="uploadFiles" />
        </div>
      </div>
      <div class="image-gallery--content" v-else>
        <div class="image-gallery--browser">
          <div class="image-gallery--filter-and-search">
            <div class="image-gallery--filter">
              <label>{{ translate('Filter media') }}</label>
              <div>
                <select>
                  <option>{{ translate('Images') }}</option>
                  <option>{{ translate('Attached to post') }}</option>
                  <option>{{ translate('Not attached to post') }}</option>
                  <option>{{ translate('Mine') }}</option>
                </select>
                <select>
                  <option>{{ translate('All dates') }}</option>
                  <option>{{ translate('September') }} 2025</option>
                </select>
              </div>
            </div>
            <div class="image-gallery--search">
              <label>{{ translate('Search in media') }}</label>
              <div>
                <input v-model="search" @keypress.enter="getItems"/>
              </div>
            </div>
          </div>
          <div class="image-gallery--grid" v-if="loading">
            Loading...
          </div>
          <div class="image-gallery--grid" v-else>
            <div class="image-gallery--grid-wrapper">
              <button
                v-for="item in response?.items || []"
                @click="toggleItem(item)"
                class="image-gallery--image"
                :class="{ selected: gallery.selectedItems.some(itm => itm.id === item.id) }"
                :key="item.id"
                :style="{
                  backgroundImage: backgroundImage(item?.file?.path)
                }"
              >
                <div class="image-gallery--image-checkbox" v-if="gallery.selectedItems.some(itm => itm.id === item.id)">
                  <svg fill="currentColor" viewBox="-5 -7 24 24" xmlns="http://www.w3.org/2000/svg"
                    preserveAspectRatio="xMinYMin">
                    <path
                      d="M5.486 9.73a1 1 0 0 1-.707-.292L.537 5.195A1 1 0 1 1 1.95 3.78l3.535 3.535L11.85.952a1 1 0 0 1 1.415 1.414L6.193 9.438a1 1 0 0 1-.707.292" />
                  </svg>
                </div>
              </button>
            </div>
          </div>
        </div>
        <div class="image-gallery--details" v-if="!file?.id">
          <label>
            {{ translate('Attachment details') }}
          </label>
          <div class="image-gallery--preview">
            {{ multi ? translate('Select files') : translate('Select file') }}
          </div>
        </div>
        <div class="image-gallery--details" v-else>
          <label>
            {{ translate('Attachment details') }}
          </label>
          <div class="image-gallery--preview">
            <div
              v-if="file?.file?.path"
              class="image-gallery--preview-image"
              :title="file?.id"
              :style="{
                backgroundImage: backgroundImage(file?.file?.path)
              }"
            />
            <div v-else class="image-gallery--preview-image"/>
            <div class="image-gallery--preview-details">
              <b>{{file?.file?.original_name}}</b>
              <div>{{file?.file?.created_at}}</div>
              <div>{{file?.file?.size}}</div>
              <div>1879 x 1252 pixels</div>
              <!--router-view>Edit image</router-view-->
              <button @click="remove(file)">{{ translate('Move to trash') }}</button>
            </div>
          </div>
          <hr />
          <table v-if="file">
            <tbody>
              <tr>
                <th>
                  {{ translate('Alt-text') }}
                </th>
                <td>
                  <textarea v-model="file.alt_text" />
                  <a href="#">
                    {{ translate('Learn how to make an image description.') }}
                  </a> {{ translate('Leave empty for decorative images.') }}
                </td>
              </tr>
              <tr>
                <th>
                  {{ translate('Title') }}
                </th>
                <td>
                  <input v-model="file.title" />
                </td>
              </tr>
              <tr>
                <th>
                  {{ translate('Image text') }}
                </th>
                <td>
                  <textarea v-model="file.caption" />
                </td>
              </tr>
              <tr>
                <th>
                  {{ translate('Image description') }}
                </th>
                <td>
                  <textarea v-model="file.description" />
                </td>
              </tr>
              <tr>
                <th>
                  {{ translate('Image url') }}
                </th>
                <td>
                  <input readonly :value="getImageUrl(file?.file?.path)" />
                  <button>{{ translate('Copy URL to clipboard') }}</button>
                </td>
              </tr>
            </tbody>
          </table>
          <button class="image-gallery--save-button" @click="save(file)">{{ translate('Update') }}</button>
        </div>
      </div>
      <div class="image-gallery--footer">
        <button v-if="!hideSelect" @click="$emit('update:modelValue', gallery.selectedItems.map(file => { return { attachment_id: file.id, ...file.file } })); $emit('close')">
          {{ translate('Select file(s)') }}{{ multi ? 's' : '' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  inject: ['translate', 'apiBase', 'apiFetch'],
  props: ['modelValue', 'field', 'priority', 'source', 'item', 'postType', 'multi', 'attachOnUpload', 'hideSelect'],
  emits: ['update:modelValue', 'close'],
  data: () => ({
    isDragging: false,
    dragCounter: 0,
    // file: { filename: '', original_name: '', mime_type: '', size: 0, path: '', attachment_id: 0 },
    file: null,
    uploading: [],
    xhrControllers: [],
    gallery: {
      tab: 'browse',
      selectedItems: [],
      filterDate: '',
      categories: []
    },
    offset: 0,
    limit: 100,
    search: '',
    searchable: ['slug', 'title'],
    orderBy: '',
    sort: '',
    response: null,
    loading: false
  }),
  computed: {
    isImage() { return this.file?.file?.mime_type?.startsWith('image/') && !this.isSvg },
    isAudio() { return this.file?.file?.mime_type?.startsWith('audio/') },
    isVideo() { return this.file?.file?.mime_type?.startsWith('video/') },
    isSvg() { return this.file?.file?.mime_type === 'image/svg+xml' },
    fileUrl() { return this.file?.file?.path ? `${this.apiBase}/uploads/${this.file.file.path}` : '' },
    isUploading() {
      return this.uploading.some(u => u.isUploading)
    }
  },
  watch: {
    isUploading(uploading) {
      if (!uploading) {
        this.getItems()
      }
    }
  },
  async mounted() {
    this.gallery.selectedItems = await Promise.all(
      this.modelValue?.map(async file => {
        const url = `${this.apiBase}/api/v1/attachments/${file.attachment_id}`
        const result = await this.apiFetch(url)
        return await result.json()
      }) || []
    ) || []
    this.file = this.gallery.selectedItems?.[0] || {}
    this.getItems()
    window.addEventListener('dragenter', this.handleDragEnter)
    window.addEventListener('dragover', this.handleDragOver)
    window.addEventListener('dragleave', this.handleDragLeave)
  },
  beforeUnmount() {
    window.removeEventListener('dragenter', this.handleDragEnter)
    window.removeEventListener('dragover', this.handleDragOver)
    window.removeEventListener('dragleave', this.handleDragLeave)
  },
  methods: {
    backgroundImage(path) {
      return `url("${this.apiBase}/uploads/${path}")`
    },
    async remove(item) {
      const url = `${this.apiBase}/api/v1/attachments/${item.id}`
      await this.apiFetch(url, { method: 'delete' })
      await this.getItems()
      this.gallery.selectedItems = this.gallery.selectedItems.filter(file => file.id !== item.id)
      this.file = this.gallery.selectedItems?.[0] || {}
    },
    async save(item) {
      const url = `${this.apiBase}/api/v1/attachments/${item.id}`
      await this.apiFetch(url, { method: 'PATCH', body: JSON.stringify({
        title: item.title,
        caption: item.caption,
        description: item.description,
        alt_text: item.alt_text
      })})
      await this.getItems()
      alert('Updated!')
    },
    getImageUrl(path) {
      return this.apiBase + '/uploads/' + path
    },
    toggleItem(item) {
      this.file = item
      if (!this.gallery.selectedItems.some(itm => itm.id === item.id)) {
        if (this.multi) {
          this.gallery.selectedItems.push(item)
        } else {
          this.gallery.selectedItems = [item]
        }
      } else {
        this.gallery.selectedItems = this.gallery.selectedItems.filter(itm => itm.id !== item.id)
      }
    },
    handleDragEnter(e) {
      e.preventDefault()
      this.dragCounter++
      this.isDragging = true
    },
    handleDragOver(e) {
      e.preventDefault()
    },
    handleDragLeave(e) {
      this.dragCounter--
      if (this.dragCounter <= 0) {
        this.isDragging = false
        this.dragCounter = 0
      }
    },
    handleDrop(e) {
      this.isDragging = false
      this.dragCounter = 0

      const files = e.dataTransfer?.files
      if (files?.length) {
        const fakeEvent = { target: { files } }
        this.uploadFiles(fakeEvent)
      }
    },
    async getItems() {
      if (this.loading) return
      this.loading = true
      try {
        const params = new URLSearchParams()

        if (this.offset < 0) this.offset = 0

        if (this.limit) params.set('limit', this.limit)
        if (this.offset) params.set('offset', this.offset)
        if (this.search) params.set('search', this.search)
        if (this.searchable) params.set('searchable', JSON.stringify(this.searchable))
        if (this.orderBy) params.set('orderBy', this.orderBy)
        if (this.sort) params.set('sort', this.sort)

        const url = `${this.apiBase}/api/v1/attachments${params.toString() ? '?' + params.toString() : ''}`

        const result = await this.apiFetch(url)
        this.response = await result.json()
      } catch(e) {
        console.error(e)
      }
      this.loading = false
    },

    selectFiles() {
      this.$refs.fileInput.click()
    },

    uploadFiles(event) {
      const uploading = []
      this.xhrControllers = []

      for (let i = 0; i < event.target.files.length; i++) {
        const file = event.target.files[i]
        const upload = {
          file,
          isUploading: true,
          progress: 0,
          failed: false,
          success: false
        }

        uploading.push(upload)

        const xhr = new XMLHttpRequest()
        this.xhrControllers.push(xhr)

        const formData = new FormData()
        formData.append('files', file)

        const tokens = JSON.parse(localStorage.getItem('tokens') || '{}')
        if (this.item?.id && this.field.slug && this.attachOnUpload) {
          xhr.open('POST', `${this.apiBase}/api/v1/${this.postType}/upload/${this.item.id}/${this.field.slug}`, true)
        } else {
          xhr.open('POST', `${this.apiBase}/api/v1/${this.postType}/upload`, true)
        }
        if (tokens?.accessToken) {
          xhr.setRequestHeader('Authorization', `Bearer ${tokens.accessToken}`)
        }

        const index = i
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) {
            const newProgress = Math.round((e.loaded / e.total) * 100)
            this.uploading[index].progress = newProgress
          }
        }

        xhr.onload = () => {
          this.uploading[index].isUploading = false
          if (xhr.status >= 200 && xhr.status < 300) {
            this.uploading[index].success = true
            const res = JSON.parse(xhr.responseText)
          } else {
            this.uploading[index].failed = true
          }
        }

        xhr.onerror = () => {
          this.uploading[index].isUploading = false
          this.uploading[index].failed = true
        }

        xhr.send(formData)
      }
      this.uploading = uploading
    },
    cancelAllUploads() {
      this.xhrControllers.forEach(xhr => xhr.abort())
      this.uploading.forEach(u => {
        if (u.isUploading) {
          u.isUploading = false
          u.failed = true
        }
      })
      this.xhrControllers = []
    },
    closeUploadOverlay() {
      this.uploading = []
      this.gallery.tab = 'browse'
    }
  }
}
</script>

<style>
.image-gallery input, .image-gallery textarea, .image-gallery select {
  padding: 5px;
}
.upload-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
}
.upload-overlay-content {
  width: 480px;
  background: var(--color-bg-navigation);
  border-radius: 12px;
  padding: 24px;
  color: var(--color);
  box-shadow: 0 0 30px rgba(0, 0, 0, 0.4);
}
.upload-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.upload-btn {
  background: var(--color-primary);
  color: var(--color-bg);
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s ease;
}
.upload-btn:hover {
  background: var(--color-primary-hover);
}

.upload-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.upload-item {
  background: var(--color-border-navigation);
  border-radius: 8px;
  padding: 10px 14px;
}
.upload-info {
  display: flex;
  justify-content: space-between;
  font-size: 0.9em;
  margin-bottom: 6px;
}
.upload-status.success {
  color: var(--color-success);
}
.upload-status.failed {
  color: var(--color-danger);
}
.upload-progress-bar {
  height: 6px;
  background: var(--color);
  border-radius: 3px;
  overflow: hidden;
}
.upload-progress-fill {
  height: 100%;
  background: var(--color-primary);
  transition: width 0.2s ease;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity .2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.image-gallery-droparea {
  position: fixed;
  z-index: 1000;
  background-color: color-mix(in srgb, var(--color-primary) 80%, transparent);
  color: var(--color-bg);
  left: 0px;
  top: 0px;
  width: 100%;
  height: 100%;
  font-size: 40px;
  font-weight: 900;
  box-sizing: border-box;
}

.image-gallery-droparea--border {
  position: fixed;
  display: flex;
  justify-content: center;
  align-items: center;
  left: 10px;
  top: 10px;
  right: 10px;
  bottom: 10px;
  border: 2px dashed var(--color-bg);
  box-sizing: border-box;
}

.image-gallery {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  padding: 40px 30px;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.image-gallery--wrapper {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  background-color: var(--color-bg);
  color: var(--color);
  display: flex;
  flex-grow: 0;
  flex-shrink: 0;
  flex-direction: column;
}

.image-gallery--header {
  height: 60px;
  display: flex;
  flex-grow: 0;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
}

.image-gallery--header h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 800;
  padding-left: 20px;
}

.image-gallery--header button {
  all: unset;
  margin-right: 15px;
  width: 20px;
  height: 20px;
  background-color: transparent !important;
  color: var(--color) !important;
  cursor: pointer;
}

.image-gallery--header button:hover {
  opacity: .5;
}

.image-gallery--tabs {
  height: 40px;
  padding-left: 5px;
  display: flex;
  flex-grow: 0;
  flex-shrink: 0;
  align-items: flex-end;
  box-sizing: border-box;
  border-bottom: 1px solid var(--color-border);
}

.image-gallery--tab {
  height: 100% !important;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0px 15px !important;
  margin: 0px !important;
  transform: translateY(1px);
  border: 1px solid transparent !important;
  border-bottom: 1px solid transparent;
  background-color: transparent !important;
  color: var(--color) !important;
  border-radius: 0 !important;
  cursor: pointer;
}

.image-gallery--tab.active {
  border: 1px solid var(--color-border) !important;
  border-bottom: 1px solid transparent !important;
  background-color: var(--color-bg) !important;
}

.image-gallery--upload {
  flex-grow: 1;
  display: flex;
  justify-content: center;
  align-items: center;
}

.image-gallery--upload-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.image-gallery--upload-wrapper h3 {
  margin: 0px;
}

.image-gallery--upload-wrapper span:last-child {
  margin-top: 20px;
}

.image-gallery--upload-wrapper button {
  border-radius: 3px;
  border: 1px solid var(--color-primary);
  color: var(--color-primary);
  background-color: transparent !important;
  padding: 20px 40px;
  cursor: pointer;
}

.image-gallery--upload-wrapper button:hover {
  color: var(--color-primary);
  background-color: var(--color-border-navigation) !important;
}

.image-gallery--content {
  flex-grow: 1;
  display: flex;
  height: calc(100% - 160px);
  overflow: auto;
}

.image-gallery--browser {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
}

.image-gallery--filter-and-search {
  display: flex;
  height: 70px;
  padding: 0px 20px;
  align-items: center;
  justify-content: space-between;
}

.image-gallery--filter-and-search select {
  /*padding: 0px 5px;*/
}

.image-gallery--filter-and-search input {
  /*padding: 0px 5px;*/
}

.image-gallery--filter label {
  font-weight: 600;
}

.image-gallery--filter {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.image-gallery--filter select:first-child {
  margin-right: 20px;
}

.image-gallery--search {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.image-gallery--filter div,
.image-gallery--search div {}

.image-gallery--grid {
  height: calc(100% - 70px);
  overflow: auto;
}

.image-gallery--grid-wrapper {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 15px;
  padding: 20px;
}

.image-gallery--image {
  all: unset;
  position: relative;
  background-color: var(--color-border);
  background-size: cover;
  background-position: center center;
  aspect-ratio: 8/7;
  cursor: pointer;
  border: 4px solid transparent;
  max-width: 120px;
}

.image-gallery--image.selected {
  border: 4px solid var(--color-primary)!important;
}

.image-gallery--image-checkbox svg {
  color: var(--color-bg)!important;
}

.image-gallery--image-checkbox {
  background-color: var(--color-primary)!important;
  width: 26px;
  height: 26px;
  display: flex;
  justify-content: center;
  align-items: center;
  color: var(--color-bg)!important;
  border: 4px solid var(--color-bg)!important;
  position: absolute;
  right: -7px;
  top: -7px;
}

.image-gallery--details {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: 311px;
  height: 100%;
  border-left: 1px solid var(--color-border);
  padding: 10px;
  box-sizing: border-box;
  overflow: auto;
  background-color: var(--color-bg-navigation);
}

.image-gallery--details label {
  margin-bottom: 10px;
  font-weight: 500;
  font-size: .9em;
  text-transform: uppercase;
}

.image-gallery--preview {
  width: 100%;
  display: flex;
  gap: 10px;
}

.image-gallery--preview-image {
  display: flex;
  flex-grow: 0;
  flex-shrink: 0;
  width: 40%;
  background-size: contain;
  background-position: center center;
  background-repeat: no-repeat;
}

.image-gallery--preview-details {}

.image-gallery--preview-details b {
  font-size: .8em;
}

.image-gallery--preview-details div {
  font-size: .8em;
}

.image-gallery--preview-details a {
  font-size: .8em;
}

.image-gallery--preview-details a:hover {}

.image-gallery--preview-details button {
  font-size: .8em;
  padding: 0px;
  height: auto;
  border-radius: 0;
  color: var(--color-danger);
  font-weight: 600 !important;
  background: transparent !important;
  border: none;
  cursor: pointer;
}

.image-gallery--preview-details button:hover {
  color: var(--color-danger);
  opacity: .8;
}

.image-gallery hr {}

.image-gallery table {
  font-size: .9em
}

.image-gallery table tr {}

.image-gallery table th {
  vertical-align: top;
  text-align: right;
  font-weight: normal;
  padding-top: 5px;
  padding-right: 10px;
}

.image-gallery table td {}

.image-gallery table a {
  color: var(--color-primary) !important;
}

.image-gallery table a:hover {}

.image-gallery table textarea {
  height: 50px;
  border-radius: 4px;
  resize: vertical;
  width: 100%;
  box-sizing: border-box;
}

.image-gallery table input {
  width: 100%;
  box-sizing: border-box;
}

.image-gallery table button {
  margin-top: 10px;
  border: 1px solid var(--color-primary);
  color: var(--color-primary) !important;
  background-color: transparent !important;
  font-size: .8em;
  padding: 5px;
  cursor: pointer;
}

.image-gallery table button:hover {}

.image-gallery--footer {
  height: 60px;
  border-top: 1px solid var(--color-border);
  display: flex;
  flex-grow: 0;
  flex-shrink: 0;
  padding-right: 20px;
  justify-content: flex-end;
  align-items: center;
}

.image-gallery--footer button, .image-gallery--save-button {
  position: relative;
  background: none;
  border: none;
  margin: 0;
  font: inherit;
  text-align: inherit;
  text-decoration: none;
  appearance: none;
  -webkit-appearance: none;
  /* Safari */
  -moz-appearance: none;
  /* Firefox */
  cursor: pointer;
  padding: 0 10px!important;
  height: 32px;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  background-color: var(--color-primary);
  color: var(--color-bg);
  font-weight: 600;
  font-size: 14px;
  border-radius: 4px;
  flex-grow: 0;
}

.image-gallery--footer button:hover, .image-gallery--save-button:hover {
  background-color: var(--color-primary-hover);
  color: var(--color-bg);
}

.image-gallery--save-button {
  margin-top: 20px;
  flex-shrink: 0;
}
</style>