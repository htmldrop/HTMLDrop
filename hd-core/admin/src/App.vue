<template>
  <router-view />
</template>

<script>
export default {
  inject: ['apiBase', 'user'],
  data: () => ({
    currentLoc: 'en_US',
    fallbackLoc: 'en_US',
    translations: {}
  }),
  provide() {
    return {
      setLocale(loc) {
        this.currentLoc = loc
      },
      translate: (str) => {
        if (this.translations?.[this.user?.locale]?.[str]) {
          return this.translations[this.user?.locale][str]
        } else if (this.translations?.[this.fallbackLoc]?.[str]) {
          return this.translations[this.fallbackLoc][str]
        }
        return str
      }
    }
  },
  async created() {
    await this.getTranslations()
    console.log('user', this.user)
  },
  watch: {
    async 'user.locale'() {
      console.log('user changed', this.user)
      await this.getTranslations()
    }
  },
  methods: {
    async getTranslations() {
      const result = await fetch(`${this.apiBase}/api/v1/translations/${this.user?.locale || this.fallbackLoc}`)
      this.translations = await result.json()
    }
  }
}
</script>

<style>
html, body, #app {
  display: flex;
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: auto;
  position: absolute;

  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

:root {
  /* Background */
  --color-bg: rgb(248, 250, 252);
  --color-bg-alt: #ffffff;
  --color-bg-navigation: #ecf0f6;
  --color-border-navigation: rgb(224, 230, 236);
  --color-bg-badges: #009deb;
  --color-bg-forms: #ffffff;

  /* Color */
  --color: #000;
  --color-badge: #ffffff;
  --color-navigation: #0c1b2d;
  --color-navigation-hover: #253344;
  --color-navigation-active: rgba(255, 255, 255, 1);
  --color-invert: invert(0);
  --color-icon: rgb(154, 164, 173);

  /* Gradient */
  --color-grad-start: #f0f5f2;
  --color-grad-end: #ebedf2;
  --color-grad-start-hover: #ebf6f0;
  --color-grad-end-hover: #e1e5f0;

  /* Base */
  --color-surface: #f3f4f6;
  --color-border: #d2d6df;
  --color-header: #485166;
  --color-text: #111827;
  --color-text-muted: #202525;
  --color-text-navigation: #dddfe4;

  /* Brand / Accent */
  --color-primary: #42b883;
  --color-primary-weak: #5eb28d;
  --color-primary-hover: #369870;
  --color-secondary: #35495e;
  --color-accent: #3b82f6;

  /* Semantic */
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.15);
}

[data-theme="dark"] {
  /* Background */
  --color-bg: #0f172a;
  --color-bg-alt: #000000;
  --color-bg-navigation: #1e293b;
  --color-border-navigation: #334155;
  --color-bg-badges: #009deb;
  --color-bg-forms: #1e293b;

  /* Color */
  --color: #fff;
  --color-badge: #ffffff;
  --color-navigation: #ffffff;
  --color-navigation-hover: rgba(255, 255, 255, 0.4);
  --color-navigation-active: rgba(255, 255, 255, 0.3);
  --color-invert: invert(1);
  --color-icon: rgb(131, 152, 171);

  /* Gradient */
  --color-grad-start: #28444d;
  --color-grad-end: #2b4761;
  --color-grad-start-hover: #15444b;
  --color-grad-end-hover: #476466;

  /* Base */
  --color-surface: #272e3f;
  --color-border: #374151;
  --color-header: rgb(150, 160, 181);
  --color-text: #f9fafb;
  --color-text-muted: #374151;
  --color-text-navigation: #cfd3dc;

  /* Brand / Accent */
  --color-primary: #42b883;
  --color-primary-weak: #6fbc9a;
  --color-primary-hover: #5fd1a0;
  --color-secondary: #4b5563;
  --color-accent: #60a5fa;

  /* Semantic */
  --color-success: #34d399;
  --color-warning: #fbbf24;
  --color-danger: #f87171;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.5);

  /* Custom */
  color-scheme: dark;

  input, select, textarea, button {
    background-color: rgb(35, 47, 59);
  }
}
</style>
