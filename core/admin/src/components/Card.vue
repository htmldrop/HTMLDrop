<template>
    <div class="card">
        <div class="card-header">
            <slot name="header" />
        </div>
        <div class="card-content">
            <slot />
        </div>
        <div class="card-footer">
            <slot name="footer"/>
        </div>
    </div>
</template>

<script>
export default {
    data: () => ({
    })
}
</script>

<style scoped>
h2, :deep(h2) {
    margin: 0;
    font-size: 15px 
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
}

.card-content {
    display: flex;
    flex-direction: column;
    padding: 10px 10px 15px;
}

.card-footer {
    display: flex;
    flex-direction: row;
    padding: 10px;
    border-top: 1px solid var(--color-border);
    font-size: 14px;
    justify-content: space-between;
}
</style>