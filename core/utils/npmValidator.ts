/**
 * NPM Package Name and Version Validator
 * Prevents command injection attacks in npm install commands
 */

export interface NpmInstallOptions {
  prefix?: string
  noSave?: boolean
  noPackageLock?: boolean
}

/**
 * Validates NPM package names according to npm naming rules
 * @see https://docs.npmjs.com/cli/v7/configuring-npm/package-json#name
 */
export function validatePackageName(packageName: string): boolean {
  if (!packageName || typeof packageName !== 'string') {
    throw new Error('Package name must be a non-empty string')
  }

  // npm package name rules:
  // - Must be lowercase
  // - Can contain hyphens, underscores, dots
  // - Can be scoped (@scope/name)
  // - No special characters that could be used for command injection
  const scopedPackageRegex = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/

  if (!scopedPackageRegex.test(packageName)) {
    throw new Error('Invalid package name format')
  }

  // Additional security checks - no shell metacharacters
  const dangerousChars = /[;&|`$(){}[\]<>\\'"]/
  if (dangerousChars.test(packageName)) {
    throw new Error('Package name contains forbidden characters')
  }

  // Length check (npm has max 214 chars)
  if (packageName.length > 214) {
    throw new Error('Package name too long')
  }

  return true
}

/**
 * Validates semantic version strings
 * Supports: 1.0.0, ^1.0.0, ~1.0.0, >=1.0.0, 1.x, latest, etc.
 */
export function validateVersion(version: string | undefined | null): boolean {
  if (!version) {
    return true // Version is optional
  }

  if (typeof version !== 'string') {
    throw new Error('Version must be a string')
  }

  // Common version tags
  const validTags = ['latest', 'next', 'beta', 'alpha', 'canary']
  if (validTags.includes(version)) {
    return true
  }

  // Semver pattern (supports ranges like ^1.0.0, ~1.0.0, >=1.0.0, 1.x, etc.)
  const semverRegex = /^([\^~>=<]*)(\d+|x|\*)(\.([\d]+|x|\*))?(\.([\d]+|x|\*))?(-[a-z0-9-_.]+)?(\+[a-z0-9-_.]+)?$/i

  if (!semverRegex.test(version)) {
    throw new Error('Invalid version format')
  }

  // No shell metacharacters
  const dangerousChars = /[;&|`$(){}[\]<>\\'"]/
  if (dangerousChars.test(version)) {
    throw new Error('Version contains forbidden characters')
  }

  // Length check
  if (version.length > 50) {
    throw new Error('Version string too long')
  }

  return true
}

/**
 * Safely constructs npm install arguments
 * Returns an array of safe arguments for child_process.spawn
 */
export function buildNpmInstallArgs(packageName: string, version?: string, options: NpmInstallOptions = {}): string[] {
  validatePackageName(packageName)
  if (version) {
    validateVersion(version)
  }

  const args = ['install']

  // Package spec
  if (version) {
    args.push(`${packageName}@${version}`)
  } else {
    args.push(packageName)
  }

  // Add safe options
  if (options.prefix) {
    args.push('--prefix', options.prefix)
  }

  if (options.noSave !== false) {
    args.push('--no-save')
  }

  if (options.noPackageLock !== false) {
    args.push('--no-package-lock')
  }

  return args
}
