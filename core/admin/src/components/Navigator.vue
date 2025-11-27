<template>
    <div class="navigator" :class="{ shrinked }">
        <div style="width: 100%; height: 10px"/>
        <div class="button" :class="{ active: item.slug === currentSlug }" v-for="item in navTree">
            <router-link :to="'/' + item.slug" class="main-button" style="display: flex">
                <div class="icon" v-html="sanitizeIcon(item.icon)" v-if="item.icon"/>
                <button v-if="!shrinked">{{ item.menu_title }}</button>
                <div v-if="!shrinked && item.badge" class="badge" :class="{ 'badge-large': (item.badge)?.toString().length > 1}">{{ item.badge }}</div>
            </router-link>
            <div
                class="dropdown"
                :style="{
                    top: isCursorAboveHalf ? '0px' : undefined,
                    bottom: isCursorAboveHalf ? undefined : '0px'
                }"
                @mouseenter="isHoveringDropdown = true"
                @mouseleave="isHoveringDropdown = false"
                v-if="item?.children?.length"
            >
                <router-link class="link" :to="'/' + item.slug + '/' + child.slug" :class="{ active: isActive(item, child) }" v-for="child in item.children?.filter(itm => itm.position < 10000)">
                    {{ child.menu_title }}
                    <div v-if="child.badge" class="badge" :class="{ 'badge-large': (child.badge)?.toString().length > 1}">{{ child.badge }}</div>
                </router-link>
                <router-link v-if="item.slug !== 'attachments' && !item.vue_instance" class="link" :to="'/' + item.slug + '/new'" :class="{ active: item.slug === currentSlug && $route.params.sub === 'new' && !$route.params.taxonomy }">
                    {{ translate('Add') }} {{ translate(item.name_singular)?.toLowerCase() }}
                </router-link>
                <button @click="mediaUploader = true" v-else-if="item.slug === 'attachments'" class="link">
                    {{ translate('Upload') }} {{ translate(item.name_singular)?.toLowerCase() }}
                </button>
                <router-link class="link" :to="'/' + item.slug + '/' + child.slug" :class="{ active: isActive(item, child) }" v-for="child in item.children?.filter(itm => itm.position >= 10000)">
                    {{ child.menu_title }}
                    <div v-if="child.badge" class="badge" :class="{ 'badge-large': (child.badge)?.toString().length > 1}">{{ child.badge }}</div>
                </router-link>
                <teleport to="body">
                    <component
                        v-if="mediaUploader"
                        :is="getControl('mediaselector')"
                        :multi="false"
                        :hideSelect="true"
                        postType="attachments"
                        @close="mediaUploader=false"
                    />
                </teleport>
            </div>
        </div>
        <div @click="$emit('toggleShrink')" class="button">
            <div class="main-button" style="display: flex">
                <div class="icon">
                    <svg :style="{transform: 'rotate(' + (shrinked ? '180deg' : '0deg') + ')'}" fill="currentColor" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg"><path d="M168 48v160a8 8 0 0 1-13.657 5.657l-80-80a8 8 0 0 1 0-11.314l80-80A8 8 0 0 1 168 48"/></svg>
                </div>
                <button v-if="!shrinked">{{ translate('Collapse menu') }}</button>
            </div>
        </div>
    </div>
</template>

<script>
import DOMPurify from 'dompurify'

export default {
    inject: ['translate', 'apiBase', 'apiFetch', 'tokens', 'updateNavTree', 'navTree', 'updateControls', 'controls', 'getControl'],
    props: {
        shrinked: {
            type: Boolean,
            default: false
        }
    },
    data: () => ({
        cursorY: 0,
        mediaUploader: false,
        isHoveringDropdown: false
    }),
    computed: {
        isCursorAboveHalf() {
            return this.cursorY < window.innerHeight / 2
        },
        currentSlug() {
            return this.$route.params.slug || this.$route.meta.slug
        }
    },
    async created() {
        await this.getTree()
        await this.getControls()
    },
    mounted() {
        window.addEventListener('mousemove', this.trackMouse)
        window.addEventListener('touchstart', this.trackTouch)
        window.addEventListener('touchmove', this.trackTouch)
    },
    beforeUnmount() {
        window.removeEventListener('mousemove', this.trackMouse)
        window.removeEventListener('touchstart', this.trackTouch)
        window.removeEventListener('touchmove', this.trackTouch)
    },
    methods: {
        sanitizeIcon(icon) {
            if (!icon) return ''

            // Sanitize HTML to prevent XSS attacks
            return DOMPurify.sanitize(icon, {
                ALLOWED_TAGS: ['svg', 'path', 'circle', 'rect', 'g', 'line', 'polyline', 'polygon', 'ellipse'],
                ALLOWED_ATTR: ['viewBox', 'd', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'cx', 'cy', 'r', 'x', 'y', 'width', 'height', 'points', 'transform', 'xmlns', 'style'],
                KEEP_CONTENT: false
            })
        },
        isActive(parent, child) {
            if (!this.$route.params.taxonomy) {
                if (!child.slug && !this.$route.params.sub) return true
                if (parent.slug === this.currentSlug && child.slug === this.$route.params.sub) return true
            } else {
                if (parent.slug === this.currentSlug && child.slug === 'terms/' + this.$route.params.taxonomy) return true
            }
            return false
        },
        trackMouse(e) {
            if (!this.isHoveringDropdown) {
                this.cursorY = e.clientY
            }
        },
        trackTouch(e) {
            if (e.touches && e.touches.length > 0) {
                this.cursorY = e.touches[0].clientY
            }
        },
        async getTree() {
            if (this.navTree?.length) return
            try {
                const res = await this.apiFetch(`${this.apiBase}/api/v1/dashboard/menu`)
                this.updateNavTree(await res.json())
            } catch(e) {
                console.log(e)
            }
        },
        async getControls() {
            if (this.controls?.length) return
            try {
                const res = await this.apiFetch(`${this.apiBase}/api/v1/dashboard/controls`)
                this.updateControls(await res.json())
            } catch(e) {
                console.log(e)
            }
        }
    }
}
</script>

<style scoped>
:deep(svg) {
    color: var(--color-icon)
}
.active :deep(svg) {
    color: var(--color-bg);
}
a {
  all: unset;
  cursor: pointer;
}
.navigator {
    display: flex;
    flex-direction: column;
    color: var(--color-bg);
    padding-top: 45px;
}

.navigator:not(.shrinked) .active .dropdown {
    display: flex;
    position: relative;
    left: -9px;
    width: 100%;
}

.main-button {
    display: flex;
    align-items: center;
    position: relative;
    padding-top: 10px!important;
    padding-bottom: 10px!important;
    width: 100%;
}

.button.active .main-button button {
    background-color: transparent!important;
    color: var(--color-bg)!important;
}

.dropdown {
    display: none;
    position: absolute;
    padding: 5px;
    background-color: var(--color-navigation-hover);
    color: var(--color-text-navigation);
    box-shadow: var(--shadow-md);
    font-weight: 500;
    flex-direction: column;
    min-width: 150px;
    left: 100%;
}

.button:hover .dropdown {
    display: flex;
}

.button {
    position: relative;
    border-left: 4px solid transparent;
    padding: 0 5px 0 5px;
    display: flex;
    flex-direction: column;
    align-items: start;
    justify-content: center;
    font-weight: 600;
    font-size: 14px;
    transition: border linear .1s;
    cursor: pointer;
}

.button.active {
    height: auto;
    background-color: var(--color-primary)!important;
}

button, .link {
    position: relative;
    background: none;
    border: none;
    margin: 0;
    font: inherit;
    color: inherit;
    text-align: inherit;
    text-decoration: none;
    appearance: none;
    -webkit-appearance: none;
    /* Safari */
    -moz-appearance: none;
    /* Firefox */
    cursor: pointer;
    padding: 0 5px;
    display: flex;
    align-items: center;
    font-weight: 600;
    font-size: 14px;
}

.dropdown button, .dropdown .link {
    border-left: 4px solid transparent;
    transition: border linear .1s;
    padding-top: 5px;
    padding-bottom: 5px;
}

.button .dropdown button.active, .button .dropdown .link.active {
    color: var(--color-bg)!important;
    font-weight: 900!important;
}

.button .dropdown button.active:hover, .button .dropdown .link.active:hover {
    border-color: var(--color-bg)!important;
}

.button .dropdown button:hover, .button .dropdown .link:hover {
    border-color: var(--color-primary-weak)!important;
}

.button:hover:not(.active),
button:hover:not(.button > div:not(.dropdown) > button),
button:hover:not(.button > div:not(.dropdown) > .link) {
    background-color: var(--color-navigation-hover);
    color: var(--color-primary-weak);
    border-color: var(--color-primary-weak);
}

.button .icon {
    margin-left: -2px;
    margin-right: 5px;
    width: 20px;
    max-height: 15px;
    display: flex;
    justify-content: center;
    align-items: center;
}
.button .icon * {
    width: 20px;
}
.badge {
    min-width: 18px;
    height: 18px;
    position: relative;
    margin-left: 5px;
    z-index: 1;
    color: var(--color-bg);
    background-color: var(--color-danger);
    display: flex;
    justify-content: center;
    align-items: center;
    border-radius: 8px;
    opacity: .95;
    font-size: 11px;
}
.badge-large {
    padding: 0px 2px;
}
</style>
