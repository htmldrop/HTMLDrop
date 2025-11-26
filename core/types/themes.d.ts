/**
 * Theme System Types
 */

declare global {
  namespace HTMLDrop {
    interface Theme {
      default(request: ThemeRequest): Promise<ThemeInstance>
    }

    interface ThemeInstance {
      init?(): Promise<void>
      render?(): Promise<string>
      onInstall?(args: LifecycleArgs): Promise<void>
      onActivate?(args: LifecycleArgs): Promise<void>
      onDeactivate?(args: LifecycleArgs): Promise<void>
      onUninstall?(args: LifecycleArgs): Promise<void>
      onUpgrade?(args: UpgradeArgs): Promise<void>
      onDowngrade?(args: UpgradeArgs): Promise<void>
    }

    interface ThemeMetadata {
      slug: string
      name: string
      version: string
      description: string
      author: string
      npmPackage?: string
      active: boolean
    }

    interface ThemeLifecycleService {
      onInstall(themeSlug: string): Promise<void>
      onActivate(themeSlug: string): Promise<void>
      onDeactivate(themeSlug: string): Promise<void>
      onUninstall(themeSlug: string): Promise<void>
      onUpgrade(themeSlug: string, oldVersion: string, newVersion: string): Promise<void>
      onDowngrade(themeSlug: string, oldVersion: string, newVersion: string): Promise<void>
      getActiveTheme(): Promise<string | null>
      setActiveTheme(themeSlug: string): Promise<void>
      createBackup(themeSlug: string): Promise<string>
      restoreBackup(themeSlug: string, backupPath: string): Promise<void>
    }

    interface LifecycleArgs {
      pluginSlug?: string
      themeSlug?: string
      timestamp: string
    }

    interface UpgradeArgs extends LifecycleArgs {
      oldVersion: string
      newVersion: string
    }
  }
}

export {}
