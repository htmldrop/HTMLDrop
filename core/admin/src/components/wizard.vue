<template>
    <div class="container">
        <div class="wizard" :style="{ maxWidth }">
            <div class="logo">
                <Logo/>
            </div>
            <div class="steps" v-if="steps.length">
                <div v-for="(label, i) in steps" class="step" :class="{ active: step === i, complete: i < step }">
                    <div class="step-title">{{ label }}</div>
                    <div class="dot" @click="$emit('step', i)"/>
                </div>
            </div>
            <div class="card">
                <slot/>
            </div>
            <div style="height: 100px;width: 100%;flex-shrink: 0"/>
        </div>
    </div>
</template>

<script>
import Logo from '@/components/Logo.vue'
export default {
    components: { Logo },
    props: {
        step: {
            type: Number,
            default: 0
        },
        steps: {
            type: Array,
            default: [
                'Database',
                'Administrator'
            ]
        },
        maxWidth: {
            type: String,
            default: 'calc(100% - 40px)'
        }
    },
    computed: {
        stepsLength() {
            return this.steps.length || 1
        }
    }
}
</script>

<style scoped>
.container {
    display: flex;
    width: 100%;
    height: 100%;
    margin: 0;
    justify-content: center;
    overflow: auto;
    background-color: var(--color-bg);
}
.wizard {
    display: flex;
    flex-direction: column;
    margin: 50px 20px;
    padding: 20px;
    width: 700px;
    align-items: center;
}
.card {
    display: flex;
    width: 100%;
    margin-top: 30px;
    background-color: var(--color-bg-alt);
    box-shadow: var(--shadow-md);
    border-radius: 4px;
    padding: 30px;
    box-sizing: border-box;
    flex-direction: column;
}
.logo {
    display: flex;
    width: 120px;
    height: 120px;
    margin-bottom: 20px;
    border-radius: 50%;
    justify-content: center;
    align-items: center;
}
.logo {
    color: var(--color-primary);
}
.steps {
    display: flex;
    width: 100%;
}
.step {
    position: relative;
    display: flex;
    text-transform: uppercase;
    border-bottom: 4px solid var(--color-text-muted);
    width: calc(100% / v-bind(stepsLength));
    justify-content: center;
}
.step.active {
    border-bottom: 4px solid var(--color-primary);
}
.step.complete {
    border-bottom: 4px solid var(--color-primary);
}
.step-title {
    padding-bottom: 25px;
    color: var(--color-primary);
    font-weight: 600;
}
.step.active .dot {
    border: 4px solid var(--color-primary);
}
.step.complete .dot {
    background-color: var(--color-primary);
    border: 4px solid var(--color-primary);
}
.dot {
    position: absolute;
    bottom: -2px;
    left: 50%;
    transform: translateX(-50%) translateY(50%);
    width: 12px;
    height: 12px;
    background-color: var(--color-bg);
    border: 4px solid var(--color-text-muted);
    border-radius: 50%;
    cursor: pointer;
}
</style>
