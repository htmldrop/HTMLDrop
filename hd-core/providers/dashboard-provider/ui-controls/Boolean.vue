<template>
  <div class="drop-control-boolean">
    <label class="switch-container">
      <input 
        type="checkbox" 
        :checked="modelValue"
        @change="$emit('update:modelValue', $event.target.checked)"
        class="switch-input"
      />
      <span class="switch-slider"></span>
    </label>
  </div>
</template>

<script>
export default {
  props: {
    modelValue: {
      type: Boolean,
      default: false
    }
  },
  emits: ['update:modelValue']
}
</script>

<style>
.drop-control-boolean {
  display: inline-block;
}

.switch-container {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 24px;
  cursor: pointer;
}

.switch-container .switch-input {
  opacity: 0;
  width: 0;
  height: 0;
}

.switch-container .switch-slider {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--color-border-navigation);
  border-radius: 16px;
  transition: background-color 0.3s ease;
}

.switch-container .switch-slider::before {
  content: '';
  position: absolute;
  height: 18px;
  width: 18px;
  left: 4px;
  bottom: 3px;
  background-color: var(--color-bg);
  border-radius: 50%;
  transition: transform 0.3s ease;
  box-shadow: 0 2px 4px var(--color-bg-navigation);
}

.switch-container .switch-input:checked + .switch-slider {
  background-color: var(--color-primary);
}

.switch-container .switch-input:checked + .switch-slider::before {
  transform: translateX(22px);
}

.switch-container .switch-input:focus + .switch-slider {
  box-shadow: 0 0 0 3px var(--color-bg-navigation);
}
</style>