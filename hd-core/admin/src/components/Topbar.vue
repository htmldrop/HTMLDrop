<template>
    <div class="topbar">
        <div class="container">
            <button style="padding-right: 10px">
                <Logo style="width: 24px"/>
                <div class="dropdown">
                    <button>{{ translate('About') }} HTMLDrop</button>
                    <button>{{ translate('Get involved') }}</button>
                </div>
            </button>
            <button>
                <svg width="17" style="transform: translateY(-2px); margin: 0 10px 0 5px" viewBox="0 -0.5 17 17" xmlns="http://www.w3.org/2000/svg" class="si-glyph si-glyph-house"><g fill="currentColor" fill-rule="evenodd"><path d="m16.794 8.77-3.81-3.906V2.017l-.968.022v1.728L9.502 1.245a.71.71 0 0 0-1.003 0L1.206 8.771a.713.713 0 0 0 0 1.002.71.71 0 0 0 1.003-.001L9 2.982l6.793 6.79a.704.704 0 0 0 1.001.001.715.715 0 0 0 0-1.003" /><path d="M4.043 9.532v5.69c0 .394.218.786.567.786h2.277l.064-3.993h4.074l-.002 3.993h2.303c.349 0 .632-.391.632-.786V9.531L9 4.625z"/></g></svg>
                <a :href="apiBase || getOrigin()">{{ translate('Website') }} {{ translate('Title') }}</a>
                <div class="dropdown">
                    <a :href="apiBase || getOrigin()">{{ translate('Show website') }}</a>
                </div>
            </button>
            <slot />
        </div>
        <button class="profile-container">
            {{ translate('Hi') }}, {{ user.email }}
            <img style="margin-left: 10px" src="@/assets/avatar.svg" width="20" height="20"/>
            <div class="profile">
                <img style="margin: 20px" width="60" height="60" src="@/assets/avatar.svg"/>
                <div style="margin: 20px 20px 10px">
                    <router-link :to="'/users/' + user.id" style="flex-direction: column; align-items: start; margin-bottom: 20px">
                        <div>{{ user.email }}</div>
                        <div>{{ translate('Edit profile') }}</div>
                    </router-link>
                    <button @click="logout">{{ translate('Logout') }}</button>
                </div>
            </div>
        </button>
    </div>
</template>

<script>
import Logo from './Logo.vue'
export default {
    components: { Logo },
    inject: ['translate', 'apiBase', 'user'],
    data: () => ({
    }),
    methods: {
        async logout() {
            try {
                const tokensRaw = localStorage.getItem('tokens')
                const tokens = JSON.parse(tokensRaw)
                await fetch(`${this.apiBase}/api/v1/auth/logout`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${tokens.accessToken}` }
                })
            } catch (e) {
                console.error(e)
            }
            localStorage.removeItem('tokens')
            this.$router.push('/login')
        },
        getOrigin() {
            return location.origin
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
.topbar {
    display: flex;
    align-items: center;
    color: var(--color-text-navigation);
    box-sizing: border-box;
    font-size: 14px;
    font-weight: 600;
}
.container {
    display: flex;
    align-items: center;
    flex-grow: 1;
}
.profile-container {
    display: flex;
    justify-self: flex-end;
    padding-right: 10px
}
.profile-container:hover .profile {
    display: flex;
}
.profile {
    right: 0px;
    left: auto!important;
}
.profile, .dropdown {
    display: none;
    position: absolute;
    padding: 5px;
    top: 100%;
    left: 0px;
    background-color: var(--color-navigation-hover);
    color: var(--color-text-navigation);
    box-shadow: var(--shadow-md);
    font-weight: 500;
}
.dropdown {
    flex-direction: column;
    min-width: 150px;
    align-items: start;
}
button:hover .dropdown {
    display: flex;
}
button, a {
    position: relative;
    background: none;
    border: none;
    margin: 0;
    font: inherit;
    color: inherit;
    text-align: inherit;
    text-decoration: none;
    appearance: none;
    -webkit-appearance: none; /* Safari */
    -moz-appearance: none;    /* Firefox */
    cursor: pointer;
    padding: 0 5px;
    height: 32px;
    display: flex;
    justify-content: center;
    align-items: center;
}
a:hover, button:hover {
    background-color: var(--color-navigation-hover);
    color: var(--color-primary-weak);
}
</style>
