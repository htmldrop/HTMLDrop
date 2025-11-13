<template>
  <div class="drop-menus" style="padding: 20px 20px 50px">
    <h1 style="margin: 0 0 20px">{{ node?.page_title }}</h1>
    <div class="wrapper">
      <div class="box">
        {{ translate('Edit your menu below, or') }}
        <select v-model="nextTerm" style="margin: 0px 5px">
          <option :value="t" v-for="t in terms?.items || []">
            {{ t.title }}
          </option>
        </select>
        <button :disabled="!nextTerm || term === nextTerm" @click="term = JSON.parse(JSON.stringify(nextTerm))" style="margin: 0px 5px">
          {{ translate('Select') }}
        </button>
        {{ translate('Edit your menu below, or') }}
        <button class="light" @click="term = null">
          {{ translate('create a new menu') }}
        </button>.
        {{ translate('Do not forget to save your changes!') }}
      </div>

      <div class="add-menu-items">
        <h2>{{ translate('Add menu items') }}</h2>
        <div class="card" :class="{ first: i === 0, show: item.show }" v-for="(item, i) in menuItems" :key="item.slug">
          <button class="card-header"
            @click="menuItems.forEach(itm => itm !== item ? itm.show = false : ''); toggle(item)">
            <div>{{ translate(item.label) }}</div>
            <div class="caret">
              <svg :style="{ transform: item.show ? 'rotate(180deg)' : 'rotate(0deg)' }" viewBox="0 0 24 24"
                fill="none">
                <path d="m17 10-5 6-5-6z" fill="currentColor" />
              </svg>
            </div>
          </button>
          <div class="card-content" v-if="item.slug !== 'custom'">
            <input />
            <div class="record" v-for="record in item.records" :key="record.label">
              <input style="position: relative; top: -1px" v-model="record.checked" type="checkbox" />
              <button @click="record.checked = !record.checked">{{ record.label }}</button>
            </div>
            <div class="bottom">
              <button>{{ translate('Add to menu') }}</button>
            </div>
          </div>
          <div class="card-content" v-else>
            <div class="record" style="justify-content: space-between;margin-bottom:10px">
              <label>Link Text</label>
              <input v-model="customLabel" />
            </div>
            <div class="record" style="justify-content: space-between;margin-bottom:10px">
              <label>URL</label>
              <input v-model="customURL" />
            </div>
            <div class="bottom">
              <button @click="addCustom">{{ translate('Add to menu') }}</button>
            </div>
          </div>
        </div>
      </div>

      <div class="menu-structure">
        <h2>{{ translate('Menu structure') }}</h2>
        <div class="card">
          <div class="card-header">
            {{ translate('Menu Name') }}
            <input v-model="title" />
          </div>
          <div class="card-content">

            <div style="margin: 5px 0px 10px">
              {{ translate('Drag the items into the order you prefer. Click the arrow on the right of the item to reveal additional configuration options.')}}
            </div>

            <nested-tree v-model="structuredNodes" :key="renderKey" @remove="remove" @render="renderKey++"/>

          </div>
          <div class="card-footer">
            <div>
              <button :disabled="!term && !title" @click="save">{{ translate('Save menu') }}</button>
              <button :disabled="!term" @click="deleteMenu" class="clean-button">{{ translate('Delete menu') }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  inject: ['translate', 'apiFetch', 'apiBase', 'navTree'],
  props: ['sub', 'slug'],
  data: () => ({
    title: '',
    customURL: '',
    customLabel: '',
    dragged: null,
    nextTerm: null,
    term: null,
    terms: null,
    nodes: [],
    menuItems: [
      { label: 'Pages', slug: 'pages', show: true, records: [{ checked: false, label: 'A' }, { checked: false, label: 'B' }, { checked: false, label: 'C' }, { checked: false, label: 'D' }, { checked: false, label: 'E' }] },
      { label: 'Posts', slug: 'posts', show: false, records: [{ checked: false, label: 'F' }, { checked: false, label: 'G' }, { checked: false, label: 'H' }, { checked: false, label: 'I' }, { checked: false, label: 'J' }] },
      { label: 'Custom', slug: 'custom', show: false, records: [] }
    ],
    structuredNodes: [],
    loading: false,
    renderKey: 0,
    deletionQueue: []
  }),
  computed: {
    node() {
      const node = this.navTree?.find(n => n.slug === this.slug)
      if (!this.sub) return node
      return node?.children?.find(n => n.slug === this.sub) || node
    }
  },
  async created() {
    await this.getMenus()
    this.structureNodes()
  },
  watch: {
    async term(val, old) {
      if (val) {
        this.title = val.title
        this.nextTerm = val
        if (val?.id !== old?.id) await this.getNodes()
      } else {
        this.title = ''
        this.nextTerm = null
        this.nodes = []
      }
      this.structureNodes()
    },
    structuredNodes(val) {
      if (this.loading) return
      this.loading = true
      this.flattenNodes()
      this.structureNodes()
      this.$nextTick(() => {
        this.loading = false
      })
    }
  },
  methods: {
    async deleteMenu() {
      if (!confirm('Are you sure you want to delete ' + this.term.title + '?')) return
      await Promise.all(this.nodes.map(async node => {
        await this.apiFetch(`${this.apiBase}/api/v1/nav_menu_item/${node.id}`, {
          method: 'DELETE'
        })
      }))
      await this.apiFetch(`${this.apiBase}/api/v1/nav_menu_item/terms/nav-menu/${this.term.id}`, {
        method: 'DELETE'
      })
      this.term = null
      this.nextTerm = null
      this.nodes = []
      await this.getMenus()
    },
    remove(node) {
      if (!node.temp && node.id) {
        this.deletionQueue.push(node.id)
      }
    },
    addCustom() {
      const order = this.nodes.filter(n => !n.parent_id).length + 1
      this.nodes.push({ temp: true, id: Math.floor(Date.now() / 1000), label: this.customLabel, link: this.customURL, parent_id: null, external: false, target: '', classes: '', order })
      this.customLabel = ''
      this.customURL = ''
      this.structureNodes()
      this.renderKey++
    },
    async save() {
      let term = this.term ? JSON.parse(JSON.stringify(this.term)) : null
      if (!term) {
        const result = await this.apiFetch(`${this.apiBase}/api/v1/nav_menu_item/terms/nav-menu`, {
          method: 'POST',
          body: JSON.stringify({ title: this.title })
        })
        term = await result.json()
      } else {
        term.title = this.title
        await this.apiFetch(`${this.apiBase}/api/v1/nav_menu_item/terms/nav-menu/${term.id}`, {
          method: 'PATCH',
          body: JSON.stringify(term)
        })
      }

      // Delete removed items first
      await Promise.all(
        this.deletionQueue.map(id =>
          this.apiFetch(`${this.apiBase}/api/v1/nav_menu_item/${id}`, {
            method: 'DELETE'
          })
        )
      )
      this.deletionQueue = []

      // Now resolve and save nodes
      let unresolved = JSON.parse(JSON.stringify([...this.nodes]))
      let resolved = []
      const resolvedIds = new Set()

      const getParent = id => unresolved.find(n => n.id === id)

      while (unresolved.length > 0) {
        // Find nodes that can be safely created or updated
        const ready = unresolved.filter(node => {
          if (node.parent_id == null) return true
          const parent = getParent(node.parent_id)
          return !parent?.temp
        })

        if (ready.length === 0) {
          console.warn('Circular or invalid temp references found:', unresolved)
          break
        }

        // Process all ready nodes concurrently
        await Promise.all(ready.map(async node => {
          if (!node.temp) {
            // Update existing node
            const { show, ...rest } = node
            await this.apiFetch(`${this.apiBase}/api/v1/nav_menu_item/${node.id}`, {
              method: 'PATCH',
              body: JSON.stringify(rest)
            })
          } else {
            // Create new node
            const { show, temp, id: tempId, ...rest } = node
            rest.terms = { 'nav-menu': [term.id] }

            // If the node has a parent_id that's still temporary, skip it for now
            const parent = getParent(node.parent_id)
            if (parent && parent.temp) return

            const res = await this.apiFetch(`${this.apiBase}/api/v1/nav_menu_item`, {
              method: 'POST',
              body: JSON.stringify(rest)
            })
            const n = await res.json()

            // Replace temp ID with actual ID
            node.id = n.id
            node.terms = n.terms
            delete node.temp

            // ✅ Update children that used this temp ID as parent_id
            unresolved.forEach(child => {
              if (child.parent_id === tempId) {
                child.parent_id = n.id
              }
            })
          }
          resolved.push(node)
          resolvedIds.add(node.id)
        }))

        // Remove processed nodes
        unresolved = unresolved.filter(n => !resolvedIds.has(n.id))
      }

      this.term = term
      this.nextTerm = term
      await this.getMenus()
      alert(this.translate('Updated') + '!')
    },
    async getMenus() {
      const result = await this.apiFetch(`${this.apiBase}/api/v1/nav_menu_item/terms/nav-menu?sort=asc&limit=10000`)
      this.terms = await result.json()
      if (this.term) {
        this.term = this.terms.items?.find(t => t.id === this.term.id)
        this.nextTerm = this.term
      }
      if (!this.nextTerm && !this.term && this.terms?.items?.length) {
        this.term = this.terms.items[0]
        this.nextTerm = this.term
      }
    },
    async getNodes() {
      if (!this.term) return this.items = []
      const query = encodeURIComponent(JSON.stringify({ taxonomy: "nav-menu", "term": this.term.id }))
      const result = await this.apiFetch(`${this.apiBase}/api/v1/nav_menu_item?taxonomy_query=${query}&limit=10000`)
      this.nodes = (await result.json())?.items
    },
    toggle(item) {
      item.show = !item.show
    },
    structureNodes() {
      const nodes = [...this.nodes].sort((a, b) => (a.order || 0) - (b.order || 0))
      const map = new Map()
      const roots = []
      let tempId = 1

      // First pass: assign temporary IDs if missing
      for (const node of nodes) {
        const id = node.id || `temp-${tempId++}`
        map.set(id, { ...node, _internalId: id, children: [] })
      }

      // Second pass: link children to parents
      for (const node of map.values()) {
        const parentId = node.parent_id
        if (parentId && map.has(parentId)) {
          map.get(parentId).children.push(node)
        } else {
          roots.push(node)
        }
      }

      // Recursive sort
      const sortChildren = arr => {
        arr.sort((a, b) => (a.order || 0) - (b.order || 0))
        for (const n of arr) sortChildren(n.children)
      }

      sortChildren(roots)

      // Cleanup: remove _internalId and temp fields before assigning
      const clean = arr => {
        return arr.map(({ _internalId, ...n }) => ({
          ...n,
          children: clean(n.children)
        }))
      }

      this.structuredNodes = clean(roots)
    },
    flattenNodes() {
      const flat = []

      const traverse = (nodes) => {
        for (const node of nodes) {
          const { children, ...rest } = node
          flat.push(rest)
          if (children?.length) traverse(children, node.id)
        }
      }

      traverse(this.structuredNodes)
      this.nodes = flat.sort((a, b) => a.order - b.order)
    }
  },
  components: {
    nestedTree: {
      template: `
        <div
            :class="{ 'tree-root': isRoot, 'moving': (isRoot ? hoverItemRoot : hoverItem) ? true : false }"
            class="tree-container add-menu-items"
            :data-shadow="(!upperSiblingHasShadow) || (!itemsFiltered?.length)"
        >
            <div class="tree-shadow tree-shadow-upper" v-if="showUpper()" ref="upper">
                <div
                    v-for="(p, i) in parents"
                    :key="'upper-' + i"
                    :data-parent-id="p?.id || 'root'"
                    :data-drop-index="getDropIndex(p, i)"
                    :style="{
                      'flex-grow': i === parents.length -1 ? 1 : undefined,
                      height: ((isRoot ? hoverItemRoot?.height : hoverItem?.height) || 40) + 'px'
                    }"
                    :class="{
                        disabled: isDisabled(p, i),
                        hover: isRoot ? hoverItemRoot?.dropParent === (p?.id || 'root') : hoverItem?.dropParent === (p?.id || 'root')
                    }"
                    class="tree-parent-box"
                />
            </div>

            <div class="tree-node-wrapper">
                <div
                    class="tree-item"
                    v-if="node"
                    :data-id="node?.id"
                    :style="{ paddingLeft: 'calc(' + indent * (parents.length - 1) + 'px)' }"
                    @pointerdown.prevent="startDrag"
                    ref="me"
                >
                    <div class="tree-item-content">
                      <div class="card" :class="{ show: node.show }">
                        <button class="card-header">
                          <div>{{ node.label }}</div>
                          <div class="caret" @pointerdown.stop="node.show = !node.show">
                            <svg :style="{ transform: node.show ? 'rotate(180deg)' : 'rotate(0deg)' }" viewBox="0 0 24 24"
                              fill="none">
                              <path d="m17 10-5 6-5-6z" fill="currentColor" />
                            </svg>
                          </div>
                        </button>
                        <div class="card-content" @pointerdown.stop>
                          <div>Navigasjonsmerke</div>
                          <input v-model="node.label" />

                          <div>{{ node?.external ? 'URL' : 'Path' }}</div>
                          <input v-model="node.link" />
                          
                          <div class="record">
                            <input type="checkbox" :value="node.target === '_blank' ? true : false" @click="node.target === '_blank' ? node.target = '' : node.target = '_blank'"/>
                            <label>Åpne lenke i ny fane</label>
                          </div>
                          <div class="record">
                            <input type="checkbox" v-model="node.external"/>
                            <label>Ekstern lenke</label>
                          </div>
                          <div class="record">
                            <input v-model="node.classes"/>
                            <label>CSS-klasser</label>
                          </div>
                          <div class="record">
                            <select v-model="node.parent_id" @change="$emit('render')">
                              <option :value="null">
                                Ingen forelder
                              </option>
                              <option v-for="option in flattenTree(isRoot ? items : root, [], node.id) || []" :value="option.id">
                                {{ option.label }}
                              </option>
                            </select>
                            <label>Overordnet meny</label>
                          </div>
                          <div class="record">
                            <select v-model="node.order" @focus="node.prev_order = node.order" @change="isRoot ? rearrange(node) : $emit('rearrange', node)">
                              <option v-for="option in isRoot ? items.length : parent.length" :value="option">
                                {{ option }} av {{ isRoot ? items.length : parent.length }}
                              </option>
                            </select>
                            <label>Menyrekkefølge</label>
                          </div>
                          <div class="record">
                            <button
                              v-if="node.order > 1"
                              @click="node.prev_order = node.order; node.order--; isRoot ? rearrange(node) : $emit('rearrange', node)"
                              style="color: var(--color-primary)"
                            >
                              Flytt opp
                            </button>
                            <button
                              v-if="isRoot ? items.length > node.order : parent.length > node.order"
                              @click="node.prev_order = node.order; node.order++; isRoot ? rearrange(node) : $emit('rearrange', node)"
                              style="color: var(--color-primary)"
                            >
                              Flytt ned
                            </button>
                          </div>
                          <div class="record">
                            <button style="color: var(--color-danger)" @click="isRoot ? remove({ node, parent: items }) : $emit('remove', { node, parent })">
                              Fjern
                            </button>
                            <button style="color: var(--color-primary)" @click="node.show = false">
                              Skjul
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                </div>

                <div class="tree-items">
                    <template v-for="(child, i) in items" :key="child.id">
                        <NestedTree
                            v-model="child.children"
                            v-if="(isRoot ? ghostItem : ghost)?.node?.id !== child?.id"
                            :parent="items"
                            :parents="[...parents, node]"
                            :root="isRoot ? items : root"
                            :node="child"
                            :indent="indent"
                            :ghost="isRoot ? ghostItem : ghost"
                            :hoverItem="isRoot ? hoverItemRoot : hoverItem"
                            @render="$emit('render')"
                            @rearrange="rearrange"
                            @remove="remove"
                            @removed="isRoot ? $emit('remove', $event) : $emit('removed', $event)"
                        />
                    </template>
                </div>
            </div>

            <div class="tree-shadow tree-shadow-lower" v-if="showLower()" ref="lower">
                <div
                    v-for="(p, i) in parents"
                    :key="'lower-' + i"
                    :data-parent-id="p?.id || 'root'"
                    :data-drop-index="getDropIndex(p, i, false)"
                    :style="{
                      height: ((isRoot ? hoverItemRoot?.height : hoverItem?.height) || 40) + 'px'
                    }"
                    :class="{
                        disabled: isDisabled(p, i, false),
                        hover: isRoot ? hoverItemRoot?.dropParent === (p?.id || 'root') : hoverItem?.dropParent === (p?.id || 'root')
                    }"
                    class="tree-parent-box"
                />
                <div
                    class="tree-parent-box"
                    style="flex-grow: 1"
                    :style="{
                      height: ((isRoot ? hoverItemRoot?.height : hoverItem?.height) || 40) + 'px'
                    }"
                    :data-parent-id="node?.id"
                    :data-drop-index="0"
                    :class="{
                        hover: isRoot ? hoverItemRoot?.dropParent === node?.id : hoverItem?.dropParent === node?.id
                    }"
                />
            </div>

            <teleport to="body" v-if="isRoot && dragState.dragging">
                <div
                    class="tree-canvas"
                    @pointermove.prevent="onRootPointerMove"
                    @pointerup.prevent="onRootPointerUp"
                    @pointercancel.prevent="onRootPointerUp"
                />
            </teleport>
        </div>
      `,
      name: 'NestedTree',

      props: {
          modelValue: { type: Array, default: () => ([]) },
          parents: { type: Array, default: () => ([]) },
          parent: { type: Array, default: () => ([]) },
          root: { type: Array, default: () => ([]) },
          node: { type: Object, default: () => (null) },
          indent: { type: Number, default: 50 },
          hoverItem: { type: Object, default: () => ({}) },
          ghost: { type: Object, default: () => ({}) }
      },

      data() {
          return {
              items: [],
              dragState: {
                  dragging: null,
                  dragCurrent: { x: 0, y: 0 }
              },
              locked: false,
              ghostItem: null,
              hoverItemRoot: null,
              dropParentRoot: null,
              dropIndexRoot: null
          }
      },

      inject: {
          rootExec: { from: 'rootExec', default: null },
          injectedDragState: { from: 'dragState', default: null }
      },

      provide() {
          const sharedDragState = this.injectedDragState || this.dragState
          const sharedRootExec = this.rootExec || ((fn) => fn(this))
          return {
              rootExec: sharedRootExec,
              dragState: sharedDragState
          }
      },

      computed: {
          isRoot() { return !this.parents?.length },
          upperSiblingHasShadow() {
              const level = this.parents.length - 1
              const parent = this.parents[level]
              const ghostId = this.isRoot ? this.ghostItem?.node?.id : this.ghost?.node?.id
              const siblings = (parent?.children || []).filter(child => child?.id !== ghostId)
              const myIndex = siblings.findIndex(child => child?.id === this.node?.id)
              if (myIndex > 0) return !!this.getDeepestLastChild(siblings[myIndex - 1])
              const parentIndex = this.parentFiltered.findIndex(child => child?.id === this.node?.id)
              if (parentIndex > 0) return !!this.getDeepestLastChild(this.parentFiltered[parentIndex - 1])
              return false
          },
          parentFiltered() {
              if (this.isRoot) return this.items?.filter(item => item?.id !== this.ghostItem?.node?.id)
              return this.parent?.filter(item => item?.id !== this.ghost?.node?.id)
          },
          itemsFiltered() {
              if (this.isRoot) return this.items?.filter(item => item?.id !== this.ghostItem?.node?.id)
              return this.items?.filter(item => item?.id !== this.ghost?.node?.id)
          }
      },

      created() {
          this.items = JSON.parse(JSON.stringify(this.modelValue))
      },

      mounted() {
          window.addEventListener('blur', this.onRootPointerUp)
      },

      unmounted() {
          window.removeEventListener('blur', this.onRootPointerUp)
      },

      watch: {
          modelValue: {
              handler(val) {
                  if (this.locked) return
                  this.locked = true
                  if (JSON.stringify(val) !== JSON.stringify(this.items)) this.items = JSON.parse(JSON.stringify(val))
                  this.$nextTick(() => this.locked = false)
              },
              deep: true
          },
          items: {
              handler(val) {
                  if (this.locked) return
                  this.locked = true
                  if (JSON.stringify(val) !== JSON.stringify(this.modelValue)) {
                      this.$emit('update:modelValue', JSON.parse(JSON.stringify(val)))
                  }
                  this.$nextTick(() => this.locked = false)
              },
              deep: true
          }
      },

      methods: {
          rearrange(node) {
            const arr = this.items
            const prev = arr.find(child => child?.id !== node?.id && child?.order === node?.order)
            if (prev) {
              prev.order = node?.prev_order
            }
            delete node.prev_order
            this.$nextTick(() => {
              this.$emit('render')
            })
          },
          remove({ node, parent }) {
            for (const child of node?.children || []) {
              child.parent_id = node.parent_id
              child.order = parent.length
              parent.push(child)
            }
            this.items = this.items.filter(child => child.id !== node.id)
            this.$nextTick(() => {
              this.$emit('render')
            })
            if (this.isRoot) {
              this.$emit('remove', node)
            } else {
              this.$emit('removed', node)
            }
          },
          flattenTree(nodes, arr = [], id) {
              for (const n of nodes) {
                  if (n.id !== id && n.id !== (this.isRoot ? this.ghostItem?.node?.id : this.ghost?.node?.id)) {
                      arr.push(n)
                      this.flattenTree(n.children, arr)
                  }
              }
              return arr
          },

          showUpper() {

              const hoverItem = this.isRoot ? this.hoverItemRoot : this.hoverItem
              if (!hoverItem) return false

              if (this.upperSiblingHasShadow) return false

              const me = this.$refs?.me
              if (!me) return false
                          
              const rect = me.getBoundingClientRect()
              
              const allNodes = this.isRoot ? this.flattenTree(this.itemsFiltered) : this.flattenTree(this.root)
              const currentIndex = allNodes.findIndex(n => n.id === this.node?.id)
              const prevNode = allNodes[currentIndex - 1]

              if (prevNode?.id) {
                const prevEl = document.querySelector(`[data-id="${prevNode.id}"]`)
                const prevRect = prevEl.getBoundingClientRect()
                if (hoverItem.cursorY <= (prevRect.top + (prevRect.height / 2))) return false
              }
              
              if (hoverItem.cursorY >= (rect.top + (rect.height / 2)) && hoverItem.id === this.node?.id) return false
              if (hoverItem.cursorY > (rect.top + (rect.height / 1.5))) return false
              
              return true
          },

          showLower() {

              const hoverItem = this.isRoot ? this.hoverItemRoot : this.hoverItem
              if (!hoverItem) return false

              if (this.itemsFiltered?.length) return false

              const me = this.$refs?.me
              if (!me) return false
                          
              const rect = me.getBoundingClientRect()
              
              const allNodes = this.isRoot ? this.flattenTree(this.itemsFiltered) : this.flattenTree(this.root)
              const currentIndex = allNodes.findIndex(n => n.id === this.node?.id)
              const nextNode = allNodes[currentIndex + 1]
              
              if (nextNode?.id) {
                const nextEl = document.querySelector(`[data-id="${nextNode.id}"]`)
                const nextRect = nextEl.getBoundingClientRect()
                if (hoverItem.cursorY >= (nextRect.top + (nextRect.height / 2)) && hoverItem.id === nextNode?.id) return false
                if (hoverItem.cursorY > (nextRect.top + (nextRect.height / 1.5))) return false
              }
              
              if (hoverItem.cursorY <= (rect.top + (rect.height / 2))) return false
              
              return true
          },

          startDrag(e) {
              e.preventDefault()
              e.target.setPointerCapture(e.pointerId)
              const point = e.touches ? e.touches[0] : e
              const wrapper = e.currentTarget.closest('.tree-node-wrapper')
              if (!wrapper) return
              (this.rootExec || ((fn) => fn(this)))((root) => {
                  const node = this.node
                  root?.startRootDrag?.(e, wrapper, { clientX: point.clientX, clientY: point.clientY }, node, this.isRoot ? this.items : this.parent)
              })
          },

          startRootDrag(origEvent, wrapperEl, point, node, parent) {
              if (!this.isRoot) return
              this.ghostItem = JSON.parse(JSON.stringify({
                  node,
                  parent,
                  prevIndex: parent.findIndex(child => child?.id === node?.id)
              }))
              const ghost = wrapperEl.cloneNode(true)
              ghost.classList.add('tree-ghost')
              ghost.style.position = 'fixed'
              ghost.style.pointerEvents = 'none'
              ghost.style.opacity = '0.9'
              ghost.style.width = `${wrapperEl.offsetWidth}px`

              const rect = wrapperEl.getBoundingClientRect()
              const offsetX = point.clientX - rect.left
              const offsetY = point.clientY - rect.top
              ghost.style.left = `${point.clientX - offsetX}px`
              ghost.style.top = `${point.clientY - offsetY}px`
              document.body.appendChild(ghost)

              this.dragState.dragging = {
                  ghost,
                  startX: point.clientX,
                  startY: point.clientY,
                  offsetX,
                  offsetY
              }
              this.dragState.dragCurrent = { x: point.clientX, y: point.clientY }

              this._onMove = (ev) => this.onRootPointerMove(ev)
              this._onUp = (ev) => this.onRootPointerUp(ev)
              document.addEventListener('pointermove', this._onMove, { passive: false })
              document.addEventListener('pointerup', this._onUp, { passive: false })
              document.addEventListener('pointercancel', this._onUp, { passive: false })
              this.onRootPointerMove(origEvent)
          },

          onRootPointerMove(e) {
              // if mouse button released outside window, buttons === 0
              if (e.buttons === 0 && this.dragState.dragging) {
                  this.onRootPointerUp(e)
                  return
              }
              const d = this.dragState.dragging
              if (!d) return
              e.preventDefault()
              const point = e.touches ? e.touches[0] : e

              d.ghost.style.left = `${point.clientX - d.offsetX}px`
              d.ghost.style.top = `${point.clientY - d.offsetY}px`

              this.dragState.dragCurrent = { x: point.clientX, y: point.clientY }

              const elementsAtPoint = document.elementsFromPoint(point.clientX, point.clientY)
              const elemContainer = elementsAtPoint?.find(el => el.classList.contains('tree-container'))
              const elem = elementsAtPoint?.find(el => el.classList.contains('tree-item'))
              const shadowBeneath = elementsAtPoint?.find(el => el.classList.contains('tree-shadow'))
              const leafBeneath = elementsAtPoint?.find(el => el.classList.contains('tree-parent-box'))
              
              if (leafBeneath && !leafBeneath.classList.contains('disabled')) {
                  const dropParent = leafBeneath.getAttribute('data-parent-id')
                  const dropIndex = leafBeneath.getAttribute('data-drop-index')
                  this.dropParentRoot = dropParent
                  this.dropIndexRoot = dropIndex
                  document.querySelectorAll('.tree-parent-box.hover').forEach(el => {
                      if (el !== leafBeneath) el.classList.remove('hover')
                  })
                  leafBeneath.classList.add('hover')
              }

              const anyShadowExists = document.querySelector('.tree-shadow') !== null

              if (elemContainer && elem) {
                  const rect = elem.getBoundingClientRect()
                  const midpointY = rect.top + rect.height / 2
                  const shadowBelongsToMe = elemContainer.getAttribute('data-shadow') ?? null
                  let shadowAbove = null

                  if (shadowBeneath) {
                      const rectShadow = shadowBeneath.getBoundingClientRect()
                      shadowAbove = rectShadow.top < rect.top
                  }

                  const dataId = elem.getAttribute('data-id') ?? null
                  const id = dataId !== null ? Number(dataId) : null

                  this.hoverItemRoot = {
                      id,
                      top: rect.top,
                      height: rect.height,
                      shadow: anyShadowExists,
                      shadowBelongsToMe: shadowBelongsToMe === 'true' || !anyShadowExists,
                      shadowBeneath: !!shadowBeneath,
                      shadowAbove,
                      midpointY,
                      cursorX: point.clientX,
                      cursorY: point.clientY
                  }
              } else if (this.hoverItemRoot) {
                this.hoverItemRoot.cursorX = point.clientX
                this.hoverItemRoot.cursorY = point.clientY
              }
          },

          onRootPointerUp() {
              const d = this.dragState.dragging
              if (!d) return
              try { d.ghost.remove() } catch { }
              this.dragState.dragging = null

              if (this._onMove) {
                  document.removeEventListener('pointermove', this._onMove)
                  document.removeEventListener('pointerup', this._onUp)
                  document.removeEventListener('pointercancel', this._onUp)
                  this._onMove = null
                  this._onUp = null
              }

              if (this.ghostItem?.node && this.dropParentRoot) {
                  this.dropItem(this.items, this.ghostItem.node, this.dropParentRoot, this.dropIndexRoot)
              }

              this.ghostItem = null
              this.hoverItemRoot = null
              this.dropParentRoot = null
              this.dropIndexRoot = null
          },

          dropItem(items, ghostItem, dropParentRoot, dropIndexRoot) {
              const findNodeAndParent = (array, id, parent = null) => {
                  for (let i = 0; i < array.length; i++) {
                      const node = array[i]
                      if (node.id === id) return { node, parent, index: i }
                      if (node.children.length) {
                          const result = findNodeAndParent(node.children, id, node)
                          if (result) return result
                      }
                  }
                  return null
              }

              const removeNode = (array, node) => {
                  const found = findNodeAndParent(array, node.id)
                  if (!found) return null

                  const { parent, index } = found
                  if (parent) {
                      parent.children.splice(index, 1)
                      parent.children.forEach((child, i) => (child.order = i + 1))
                  } else {
                      array.splice(index, 1)
                      array.forEach((child, i) => (child.order = i + 1))
                  }
                  return { parent, index }
              }

              const originalPosition = removeNode(items, ghostItem)
              const targetParent = dropParentRoot === 'root' ? null : findNodeAndParent(items, Number(dropParentRoot))?.node

              if (dropParentRoot !== 'root' && !targetParent) {
                  if (originalPosition) {
                      const { parent, index } = originalPosition
                      if (parent) {
                          parent.children.splice(index, 0, ghostItem)
                          parent.children.forEach((child, i) => (child.order = i + 1))
                      } else {
                          items.splice(index, 0, ghostItem)
                          items.forEach((child, i) => (child.order = i + 1))
                      }
                  }
                  return
              }

              if (!targetParent) {
                  ghostItem.parent_id = null
                  items.splice(dropIndexRoot, 0, ghostItem)
                  items.forEach((child, i) => (child.order = i + 1))
              } else {
                  ghostItem.parent_id = targetParent.id
                  targetParent.children.splice(dropIndexRoot, 0, ghostItem)
                  targetParent.children.forEach((child, i) => (child.order = i + 1))
              }
          },

          getDeepestLastChild(node) {
              if (!node?.children?.length) return node
              return this.getDeepestLastChild(node.children[node.children.length - 1])
          },

          allowBackwards(targetLevel) {
              const ancestors = this.parents
              const currentIndex = this.parentFiltered.findIndex(c => c?.id === this.node?.id)
              const isLastSibling = currentIndex === this.parentFiltered.length - 1
              let level = ancestors.length - 1, stops = 0
              while (level >= targetLevel) {
                  if (stops > 1) return false

                  const ghostId = this.isRoot ? this.ghostItem?.node?.id : this.ghost?.node?.id
                  const parentArray = ancestors?.[level - 1]?.children?.filter(child => child?.id !== ghostId) || this.root.filter(child => child?.id !== ghostId)
                  const currentNode = ancestors[level]
                  const nodeIndex = parentArray.findIndex(c => c?.id === currentNode?.id)
                  const hasNextSibling = parentArray.length - 1 > nodeIndex
                  if (hasNextSibling) {
                      if (!isLastSibling) return false
                      stops++
                  }
                  level--
              }
              return true
          },

          isDisabled(parent, levelIndex, before = true) {
              const ghostId = this.isRoot ? this.ghostItem?.node?.id : this.ghost?.node?.id
              const siblings = parent?.children?.filter(child => child?.id !== ghostId) || this.root.filter(child => child?.id !== ghostId)
              if (siblings.some(child => child?.id === this.node?.id)) return false
              if (!before && this.allowBackwards(levelIndex)) return false
              return true
          },

          getDropIndex(parent, levelIndex, before = true) {
              const ghostId = this.isRoot ? this.ghostItem?.node?.id : this.ghost?.node?.id

              if (!parent) {
                  const arr = this.isRoot ? this.itemsFiltered : this.root?.filter(child => child?.id !== ghostId) || []
                  const target = this.parents?.[levelIndex + 1] ?? this.node
                  if (target) {
                      let idx = arr?.findIndex(child => child.id === target.id)
                      if (!before) idx++
                      return idx
                  } else {
                      return !before ? 1 : 0
                  }
              } else {
                  const target = this.parents?.[levelIndex + 1] ?? this.node
                  if (target) {
                      let idx = parent?.children?.filter(child => child?.id !== ghostId)?.findIndex(child => child.id === target.id)
                      if (!before) idx++
                      return idx
                  } else {
                      return !before ? 1 : 0
                  }
              }
          }
      }
    }
  }
}
</script>

<style>
.wrapper {
  display: flex;
  width: 100%;
  gap: 25px;
  flex-wrap: wrap;
}

.drop-menus h2 {
  font-size: 18px;
}

.add-menu-items {
  min-width: 300px;
  max-width: 100%!important;
  box-sizing: border-box;
}

.menu-structure {
  flex-grow: 1;
  max-width: calc(100% - 300px - 25px);
  box-sizing: border-box;
}

.drop-menus .box {
  background: var(--color-bg-forms);
  border: 1px solid var(--color-border);
  width: 100%;
  flex-shrink: 0;
  padding: 10px;
  font-size: 14px;
  box-sizing: border-box;
}

.drop-menus .box button.light {
  all: unset;
  text-decoration: underline;
  color: var(--color-primary);
  cursor: pointer;
}

.drop-menus .box button.light:hover {
  color: var(--color-primary-hover);
}

h2,
:deep(h2) {
  margin: 0;
  font-size: 15px;
}

.card {
  display: flex;
  flex-direction: column;
  background: var(--color-bg-forms);
  border: 1px solid var(--color-border);
  width: 100%;
}

.card-header {
  display: flex;
  padding: 8px 10px;
  border-bottom: 1px solid var(--color-border);
  align-items: center;
}

.add-menu-items .card, .tree-ghost .card {
  border-bottom-width: 0px;
  border-top-width: 0px;
}

.add-menu-items .card-content {
  padding-top: 0px;
  padding-bottom: 0px;
  max-height: 0px;
  overflow: hidden;
  transition: max-height .25s ease, padding .25s ease;
  gap: 5px;
}

.tree-ghost .card-content {
  display: none;
}

.add-menu-items .card-content .record {
  display: flex;
  width: 100%;
  gap: 5px;
  align-items: center;
}

.add-menu-items .card-content .record button {
  all: unset;
  flex-grow: 1;
  cursor: pointer;
}

.add-menu-items .card.show .card-content {
  border-bottom: 1px solid var(--color-border);
  padding-top: 10px;
  padding-bottom: 10px;
  overflow: auto;
  max-height: 1000px;
}

.add-menu-items .card.first {
  border-top-width: 1px;
}

.add-menu-items .card-header, .tree-ghost .card-header {
  all: unset;
  display: flex;
  padding: 8px 10px;
  border-bottom: 1px solid var(--color-border);
  align-items: center;
  cursor: pointer;
  font-weight: bold;
  justify-content: space-between;
}

.add-menu-items .card-header:hover,
.add-menu-items .card.show .card-header {
  background-color: var(--color-bg-navigation);
}

.add-menu-items .card-header .caret, .tree-ghost .card-header .caret {
  width: 20px;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.menu-structure .card-header, .tree-ghost .card-header {
  display: flex;
  font-size: 14px;
  background-color: var(--color-bg-navigation);
  gap: 10px;
}

.drop-menus .add-menu-items .card-content>input {
  margin-top: 5px;
  margin-bottom: 10px;
}

.drop-menus .add-menu-items .card-content>.bottom {
  margin-top: 5px;
  margin-bottom: 5px;
  padding-top: 10px;
  text-align: right;
  border-top: 1px solid var(--color-border);
}

.drop-menus input,
.drop-menus select {
  padding: 5px;
  font-size: 16px;
}

.card-content {
  display: flex;
  flex-direction: column;
  padding: 10px 10px 15px;
  font-size: 14px;
}

.card-footer {
  display: flex;
  flex-direction: row;
  padding: 10px;
  border-top: 1px solid var(--color-border);
  font-size: 14px;
  justify-content: space-between;
}

.drop-menus button {
  position: relative;
  background: none;
  border: none;
  margin: 0;
  font: inherit;
  text-align: inherit;
  text-decoration: none;
  appearance: none;
  cursor: pointer;
  padding: 0 15px;
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

.drop-menus button:hover {
  background-color: var(--color-primary-hover);
}

.drag-handle {
  cursor: grab;
  color: var(--color-primary);
  user-select: none;
}

@media (max-width: 768px) {
  .wrapper {
    flex-direction: column;
  }

  .add-menu-items {
    width: 100%;
  }

  .menu-structure {
    max-width: 100%;
  }

  .add-menu-items {
    min-width: 150px!important;
  }

  .tree-ghost .tree-item-content {
    width: 150px;
  }
}

/** */

.cover {
  position: fixed;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
  z-index: 10000;
}

.route-wrapper-parent {
  user-select: none;
  display: inline-block;
  margin: 5px;
  box-sizing: border-box;
}

.moving .route-wrapper-parent {
  transition: padding linear .3s
}

.isMoving .route-wrapper {
  background-color: var(--color-border-navigation);
  box-shadow: 1px 1px 2px 1px rgb(0 0 0 / .08);
}

.route-wrapper {
  position: relative;
  user-select: none;
  display: inline-block;
  padding: 10px 0px 0px 70px;
  background-color: var(--color-bg-toolbars);
  border-radius: 8px;
  box-sizing: border-box;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
  height: 60px;
}

.route-wrapper .wrap-3col {
  display: inline-block;
  width: calc((100% / 3) - 36px);
  margin-top: 6px;
  height: 34px;
  box-sizing: border-box;
  padding: 0px 5px;
}

.route-wrapper .wrap-3col>input,
.route-wrapper .wrap-3col>select {
  border: 3px solid var(--color-border-navigation);
  width: 100%;
  height: 100%;
  padding: 0px 10px;
  border-radius: 6px;
  box-sizing: border-box;
  background-color: var(--color-bg-toolbars);
}

.route-wrapper .wrap-3col label {
  position: absolute;
  font-size: 10px;
  font-weight: bold;
  top: 4px;
  margin-left: 3px;
  color: var(--color);
}

.route-wrapper .dragger {
  display: flex;
  width: 30px;
  height: 30px;
  position: absolute;
  justify-content: center;
  align-items: center;
  top: 15px;
  left: 10px;
  border-radius: 8px;
  transition: all .3s linear;
  cursor: pointer;
}

.route-wrapper .dragger:hover {
  background-color: var(--color-bg-toolbars);
}

.route-wrapper .propler {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 30px;
  height: 30px;
  position: absolute;
  top: 15px;
  left: 43px;
  border-radius: 8px;
  transition: all .3s linear;
  cursor: pointer;
}

.route-wrapper .propler.active {
  background-color: var(--color-bg) !important;
}

.route-wrapper .propler:hover {
  background-color: var(--color-bg);
}

.route-wrapper .toggler {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 30px;
  height: 30px;
  position: absolute;
  top: 15px;
  right: 80px;
  border-radius: 8px;
  transition: all .3s linear;
  cursor: pointer;
}

.route-wrapper .toggler:hover {
  background-color: var(--color-bg);
}

.route-wrapper .remover.disabled {
  opacity: .4
}

.route-wrapper .remover {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 30px;
  height: 30px;
  position: absolute;
  top: 15px;
  right: 45px;
  border-radius: 8px;
  transition: all .3s linear;
  cursor: pointer;
}

.route-wrapper .remover:hover {
  background-color: var(--color-bg);
}

.route-wrapper .addler {
  width: 30px;
  height: 30px;
  position: absolute;
  top: 15px;
  right: 10px;
  background-image: var(--image-plus);
  background-size: 40%;
  background-position: center;
  background-repeat: no-repeat;
  border-radius: 8px;
  transition: all .3s linear;
  cursor: pointer;
}

.route-wrapper .addler:hover {
  background-color: var(--color-bg);
}

.route-wrapper-shadow {
  position: absolute;
  top: 0px;
  user-select: none;
  display: inline-block;
  padding: 15px;
  background-color: var(--color);
  border-radius: 8px;
  box-sizing: border-box;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}

.route-wrapper-shadow.subLevel {
  width: calc(100% - 50px);
  left: 50px;
}

.route-wrapper {
  background-color: var(--color-bg-navigation);
}

.route-wrapper:hover {
  background-color: var(--color-border-navigation);
}

.route-wrapper>div {
  width: 100%;
  overflow: hidden;
  white-space: nowrap;
}

.tree-canvas {
    position: fixed;
    inset: 0;
    z-index: 9998;
    background: transparent;
    touch-action: none;
    cursor: grabbing;
}

.tree-ghost {
    z-index: 9999;
    pointer-events: none;
    transition: all ease .1s;
}

.tree-shadow-upper,
.tree-shadow-lower {
    display: flex;
    width: 100%;
    flex-wrap: nowrap;
}

.tree-item {
    display: flex;
}
.tree-item-content {
    display: flex;
    flex-grow: 0;
    min-height: 40px;
    margin: 3px 0px;
    box-sizing: border-box;
    align-items: center;
}

.tree-ghost .tree-item-content {
    display: inline-block;
    flex-grow: unset;
    min-height: 40px;
    margin: 3px 0px;
    box-sizing: content-box;
    align-items: center;
    width: 300px;
}

.tree-item {
  width: 290px;
  max-width: calc(100% - 150px)
}

.tree-item-content .card, .tree-ghost .card {
    border-top: 1px solid var(--color-border);
}

.tree-item-content .record button {
  text-decoration: underline!important;
}

.tree-item-content .record button:hover {
  filter: brightness(90%);
}

button[disabled] {
  opacity: 50%;
}

.tree-parent-box {
    display: inline-flex;
    width: 46px;
    margin: 0px 2px;
    flex-grow: 0;
    outline: 2px dashed var(--color-border);
    outline-offset: -2px;
    border-radius: 6px;
    transition: all ease .2s;
    box-sizing: border-box;
}

.tree-parent-box.disabled {
    background: transparent;
    outline: 2px dashed transparent;
}

.tree-parent-box:not(.disabled).hover {
    background: var(--color-border-navigation)
}

.tree-root {
    width: 100%;
    height: 100%;
}
.tree-item * {
  overflow: hidden!important
}
.tree-item .card-header {
  cursor: move;
}
.tree-item .card-header .caret {
  cursor: pointer;
}

.drop-menus .clean-button {
  background: unset;
  color: var(--color-danger);
  margin-left: 10px;
  font-weight: 500;
  text-decoration: underline;
}
.drop-menus .clean-button:hover {
  background: unset;
  filter: brightness(90%);
}
.tree-shadow, .tree-shadow > div {
  max-height: 42px!important;
  overflow: hidden;
}
</style>
