/**
 * Plugin System Types
 */

declare global {
  namespace HTMLDrop {
    interface Plugin {
      default(request: PluginRequest): Promise<PluginInstance>
    }

    interface PluginInstance {
      init?(): Promise<void>
      onInstall?(args: LifecycleArgs): Promise<void>
      onActivate?(args: LifecycleArgs): Promise<void>
      onDeactivate?(args: LifecycleArgs): Promise<void>
      onUninstall?(args: LifecycleArgs): Promise<void>
      onUpgrade?(args: UpgradeArgs): Promise<void>
      onDowngrade?(args: UpgradeArgs): Promise<void>
    }

    interface PluginMetadata {
      slug: string
      name: string
      version: string
      description: string
      author: string
      npmPackage?: string
      active: boolean
      htmldrop?: {
        version?: string
        requires?: string
        dependencies?: string[]
      }
    }

    interface PluginLifecycleService {
      onInstall(pluginSlug: string): Promise<void>
      onActivate(pluginSlug: string): Promise<void>
      onDeactivate(pluginSlug: string): Promise<void>
      onUninstall(pluginSlug: string): Promise<void>
      onUpgrade(pluginSlug: string, oldVersion: string, newVersion: string): Promise<void>
      onDowngrade(pluginSlug: string, oldVersion: string, newVersion: string): Promise<void>
      checkDependencies(pluginSlug: string): Promise<{ met: boolean; missing: string[] }>
      getDependentPlugins(pluginSlug: string): Promise<string[]>
      createBackup(pluginSlug: string): Promise<string>
      restoreBackup(pluginSlug: string, backupPath: string): Promise<void>
    }
  }
}

export {}
