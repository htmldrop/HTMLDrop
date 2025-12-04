import type { Request, Response, NextFunction } from 'express'

interface DropdownItem {
  id: string
  label: string
  icon?: string
  href?: string
  onclick?: string
}

interface AdminBarButton {
  id: string
  label: string
  icon?: string
  href?: string
  onclick?: string
  script?: string
  position?: number
  dropdown?: DropdownItem[]
  classes?: string
}

interface ButtonConfig {
  id: string
  label: string
  icon?: string
  href?: string
  onclick?: string
  position: number
  dropdown?: DropdownItem[]
  classes?: string
}

interface Script {
  id: string
  code: string
}

/**
 * Registry for admin bar buttons
 * Allows plugins and themes to register custom buttons in the admin bar
 */
export default class RegisterAdminBarButtons {
  private req: Request
  private buttons: ButtonConfig[]
  private scripts: Script[]

  constructor(req: Request, res: Response, next: NextFunction) {
    this.req = req
    this.buttons = []
    this.scripts = []
  }

  /**
   * Register a button in the admin bar
   */
  registerButton(button: AdminBarButton): void {
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
   */
  unregisterButton(id: string): void {
    this.buttons = this.buttons.filter(b => b.id !== id)
    this.scripts = this.scripts.filter(s => s.id !== id)
  }

  /**
   * Get all registered buttons
   */
  getButtons(): ButtonConfig[] {
    return this.buttons
  }

  /**
   * Get a button by ID
   */
  getButton(id: string): ButtonConfig | null {
    return this.buttons.find(b => b.id === id) || null
  }

  /**
   * Get combined script code for all buttons
   */
  getCombinedScripts(): string {
    return this.scripts.map(s => s.code).join('\n\n')
  }

  // Private helpers

  private _upsertButton(buttonConfig: ButtonConfig): void {
    const index = this.buttons.findIndex(b => b.id === buttonConfig.id)
    if (index !== -1) {
      this.buttons[index] = buttonConfig
    } else {
      this.buttons.push(buttonConfig)
    }
    // Keep sorted by position
    this.buttons.sort((a, b) => a.position - b.position)
  }

  private _upsertScript(id: string, code: string): void {
    const index = this.scripts.findIndex(s => s.id === id)
    if (index !== -1) {
      this.scripts[index] = { id, code }
    } else {
      this.scripts.push({ id, code })
    }
  }
}
