<template>
    <div
        :class="{ 'tree-root': isRoot }"
        class="tree-container"
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
                :style="{ paddingLeft: `calc(${indent * (parents.length - 1)}px)` }"
                @pointerdown.prevent="startDrag"
                ref="me"
            >
                <div class="tree-item-content">
                    id: {{ node?.id }} -
                    pid: {{ node?.parent_id }} -
                    order: {{ node?.order }}
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
</template>

<script>
const tree = [{ "id": 111, "label": "Test 1", "link": "#", "parent_id": null, "external": false, "target": "", "classes": "", "order": 1, "children": [] }, { "id": 123, "label": "Test 1", "link": "#", "parent_id": null, "external": false, "target": "", "classes": "", "order": 1, "children": [] }, { "id": 1, "label": "Test 1", "link": "#", "parent_id": null, "external": false, "target": "", "classes": "", "order": 1, "children": [{ "id": 4, "label": "Test A", "link": "#", "parent_id": 1, "external": false, "target": "", "classes": "", "order": 1, "children": [{ "id": 10, "label": "Test A1", "link": "#", "parent_id": 4, "external": false, "target": "", "classes": "", "order": 1, "children": [{ "id": 15, "label": "Test A1a", "link": "#", "parent_id": 10, "external": false, "target": "", "classes": "", "order": 1, "children": [] }, { "id": 16, "label": "Test A1b", "link": "#", "parent_id": 10, "external": false, "target": "", "classes": "", "order": 2, "children": [] }] }, { "id": 11, "label": "Test A2", "link": "#", "parent_id": 4, "external": false, "target": "", "classes": "", "order": 2, "children": [] }] }, { "id": 5, "label": "Test B", "link": "#", "parent_id": 1, "external": false, "target": "", "classes": "", "order": 2, "children": [{ "id": 12, "label": "Test B1", "link": "#", "parent_id": 5, "external": false, "target": "", "classes": "", "order": 1, "children": [] }, { "id": 13, "label": "Test B2", "link": "#", "parent_id": 5, "external": false, "target": "", "classes": "", "order": 2, "children": [{ "id": 17, "label": "Test B2a", "link": "#", "parent_id": 13, "external": false, "target": "", "classes": "", "order": 1, "children": [] }] }] }, { "id": 6, "label": "Test C", "link": "#", "parent_id": 1, "external": false, "target": "", "classes": "", "order": 3, "children": [] }] }, { "id": 2, "label": "Test 2", "link": "#", "parent_id": null, "external": false, "target": "", "classes": "", "order": 2, "children": [{ "id": 7, "label": "Test 2A", "link": "#", "parent_id": 2, "external": false, "target": "", "classes": "", "order": 1, "children": [] }, { "id": 8, "label": "Test 2B", "link": "#", "parent_id": 2, "external": false, "target": "", "classes": "", "order": 2, "children": [{ "id": 18, "label": "Test 2B1", "link": "#", "parent_id": 8, "external": false, "target": "", "classes": "", "order": 1, "children": [] }] }] }, { "id": 3, "label": "Test 3", "link": "#", "parent_id": null, "external": false, "target": "", "classes": "", "order": 3, "children": [{ "id": 9, "label": "Test 3A", "link": "#", "parent_id": 3, "external": false, "target": "", "classes": "", "order": 1, "children": [{ "id": 14, "label": "Test 3A1", "link": "#", "parent_id": 9, "external": false, "target": "", "classes": "", "order": 1, "children": [] }] }] }]

export default {
    name: 'NestedTree',
    components: { NestedTree: null },

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
            items: tree,
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
        this.$options.components.NestedTree = this.$options
        if (!this.node) this.items = tree
        else this.items = JSON.parse(JSON.stringify(this.modelValue))
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
        flattenTree(nodes, arr = []) {
            for (const n of nodes) {
                if (n.id !== (this.isRoot ? this.ghostItem?.node?.id : this.ghost?.node?.id)) {
                    arr.push(n)
                    if (n.children?.length) this.flattenTree(n.children, arr)
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
</script>

<style>
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
    background: rgba(200, 200, 200, .9);
    border-radius: 4px;
    flex-grow: 0;
    padding: 5px 10px;
    height: 40px;
    margin: 3px 0px;
    box-sizing: border-box;
    align-items: center;
}

.tree-parent-box {
    display: inline-flex;
    width: 46px;
    margin: 0px 2px;
    flex-grow: 0;
    background: rgba(200, 200, 200, .7);
    border-radius: 6px;
    transition: all ease .2s;
}

.tree-parent-box.disabled {
    background: transparent;
}

.tree-parent-box:not(.disabled).hover {
    background: rgba(0, 0, 0, .5);
}

.tree-root {
    width: 100%;
    height: 100%;
}
</style>