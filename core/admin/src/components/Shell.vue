<template>
    <div class="wrapper">
        <div class="content">
            <Topbar class="topbar"/>
            <Navigator class="navigator" @toggleShrink="toggleShrink" :shrinked="shrinked"/>
            <div class="slot">
                <router-view/>
            </div>
            <div class="version">Version {{ json?.version }}</div>
        </div>
    </div>
</template>

<script>
import Topbar from './Topbar.vue'
import Navigator from './Navigator.vue'
import json from '../../package.json'
export default {
    components: { 
        Topbar,
        Navigator
    },
    data: () => ({
        json,
        shrinked: false
    }),
    computed: {
        navWidth() {
            return this.shrinked ? '35px' : '160px'
        }
    },
    methods: {
         toggleShrink() {
            this.shrinked = !this.shrinked
        }
    }
}
</script>

<style scoped>
.wrapper {
    display: flex;
    position: fixed;
    width: 100%;
    height: 100%;
    overflow: auto;
}
.topbar {
    display: flex;
    position: sticky;
    top: 0px;
    width: 100%;
    height: 32px;
    flex-shrink: 0;
    flex-grow: 0;
    background-color: var(--color-navigation);
    z-index: 150;
}
.navigator {
    position: absolute;
    padding-top: 32px;
    top: 0px;
    left: 0px;
    width: v-bind(navWidth);
    min-height: calc(100% - 32px);
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    background-color: var(--color-navigation);
    z-index: 100;
}
.content {
    display: flex;
    flex-direction: column;
    position: absolute;
    right: 0px;
    width: 100%;
    min-height: 100%;
    background-color: var(--color-bg);
    box-sizing: border-box;
}
.slot {
    display: flex;
    margin-left: v-bind(navWidth);
    flex-direction: column;
    min-height: calc(100vh - 32px);
    z-index: 1;
}
.version {
    position: absolute;
    bottom: 10px;
    right: 20px;
    font-size: 14px;
}
</style>
