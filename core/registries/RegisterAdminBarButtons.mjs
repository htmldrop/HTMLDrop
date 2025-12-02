/**
 * Registry for admin bar buttons
 * Allows plugins and themes to register custom buttons in the admin bar
 */
export default class RegisterAdminBarButtons {
  constructor(req, res, next) {
    this.req = req
    this.buttons = []
    this.scripts = []
  }

  /**
   * Register a button in the admin bar
   * @param {Object} button - Button configuration
   * @param {string} button.id - Unique button ID
   * @param {string} button.label - Button text/label
   * @param {string} [button.icon] - SVG icon string
   * @param {string} [button.href] - Link URL (creates link instead of button)
   * @param {string} [button.onclick] - JavaScript function name to call on click
   * @param {string} [button.script] - Client-side JavaScript code to execute
   * @param {number} [button.position=1000] - Position in admin bar (lower = left)
   * @param {Array} [button.dropdown] - Dropdown menu items
   * @param {string} [button.classes] - Additional CSS classes
   */
  registerButton(button) {
    if (!button?.id || !button?.label) {
      console.error('[AdminBar] Button must have id and label')
      return
    }

    const position = button.position ?? 1000

    // Store script separately if provided
    if (button.script) {
      this._upsertScript(button.id, button.script)
    }

    // Don't send script to client (only button config)
    const { script, ...buttonConfig } = button

    // Upsert button (replace if exists, add if new)
    this._upsertButton({ ...buttonConfig, position })
  }

  /**
   * Remove a button from the admin bar
   * @param {string} id - Button ID to remove
   */
  unregisterButton(id) {
    this.buttons = this.buttons.filter(b => b.id !== id)
    this.scripts = this.scripts.filter(s => s.id !== id)
  }

  /**
   * Get all registered buttons
   * @returns {Array} Array of button configurations
   */
  getButtons() {
    return this.buttons
  }

  /**
   * Get a button by ID
   * @param {string} id - Button ID
   * @returns {Object|null} Button configuration or null
   */
  getButton(id) {
    return this.buttons.find(b => b.id === id) || null
  }

  /**
   * Get combined script code for all buttons
   * @returns {string} All scripts concatenated
   */
  getCombinedScripts() {
    return this.scripts.map(s => s.code).join('\n\n')
  }

  // Private helpers

  _upsertButton(buttonConfig) {
    const index = this.buttons.findIndex(b => b.id === buttonConfig.id)
    if (index !== -1) {
      this.buttons[index] = buttonConfig
    } else {
      this.buttons.push(buttonConfig)
    }
    // Keep sorted by position
    this.buttons.sort((a, b) => a.position - b.position)
  }

  _upsertScript(id, code) {
    const index = this.scripts.findIndex(s => s.id === id)
    if (index !== -1) {
      this.scripts[index] = { id, code }
    } else {
      this.scripts.push({ id, code })
    }
  }
}
