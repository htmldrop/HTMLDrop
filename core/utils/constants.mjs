/**
 * Application Constants
 *
 * Centralized constants for the HTMLDrop CMS application
 */

// ============================================================================
// HTTP Status Codes
// ============================================================================

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
}

// ============================================================================
// Post Status
// ============================================================================

export const POST_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  PENDING: 'pending',
  PRIVATE: 'private',
  TRASH: 'trash'
}

export const VALID_POST_STATUSES = Object.values(POST_STATUS)

// ============================================================================
// User Roles
// ============================================================================

export const USER_ROLES = {
  ADMIN: 'admin',
  EDITOR: 'editor',
  AUTHOR: 'author',
  CONTRIBUTOR: 'contributor',
  SUBSCRIBER: 'subscriber',
  GUEST: 'guest'
}

// ============================================================================
// Capabilities
// ============================================================================

export const CAPABILITIES = {
  // Post capabilities
  CREATE_POSTS: 'create_posts',
  EDIT_POSTS: 'edit_posts',
  EDIT_OTHERS_POSTS: 'edit_others_posts',
  DELETE_POSTS: 'delete_posts',
  DELETE_OTHERS_POSTS: 'delete_others_posts',
  READ_POSTS: 'read_posts',
  READ_PRIVATE_POSTS: 'read_private_posts',
  PUBLISH_POSTS: 'publish_posts',

  // Page capabilities
  CREATE_PAGES: 'create_pages',
  EDIT_PAGES: 'edit_pages',
  EDIT_OTHERS_PAGES: 'edit_others_pages',
  DELETE_PAGES: 'delete_pages',
  DELETE_OTHERS_PAGES: 'delete_others_pages',
  READ_PAGES: 'read_pages',
  PUBLISH_PAGES: 'publish_pages',

  // User capabilities
  CREATE_USERS: 'create_users',
  EDIT_USERS: 'edit_users',
  DELETE_USERS: 'delete_users',
  LIST_USERS: 'list_users',

  // Plugin capabilities
  INSTALL_PLUGINS: 'install_plugins',
  ACTIVATE_PLUGINS: 'activate_plugins',
  DELETE_PLUGINS: 'delete_plugins',
  UPDATE_PLUGINS: 'update_plugins',

  // Theme capabilities
  INSTALL_THEMES: 'install_themes',
  SWITCH_THEMES: 'switch_themes',
  DELETE_THEMES: 'delete_themes',
  UPDATE_THEMES: 'update_themes',

  // System capabilities
  MANAGE_OPTIONS: 'manage_options',
  MANAGE_POST_TYPES: 'manage_post_types',
  MANAGE_TAXONOMIES: 'manage_taxonomies',
  MANAGE_TERMS: 'manage_terms',
  UPLOAD_FILES: 'upload_files'
}

// ============================================================================
// File Upload
// ============================================================================

export const UPLOAD_LIMITS = {
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB default
  MAX_FILES: 10
}

/**
 * File type definitions
 *
 * By default, the core system allows all file types (when ALLOWED_FILE_EXTENSIONS is not set).
 * To restrict uploads, set ALLOWED_FILE_EXTENSIONS environment variable to a comma-separated list.
 *
 * Examples:
 * - ALLOWED_FILE_EXTENSIONS=jpg,png,gif,pdf (specific types)
 * - ALLOWED_FILE_EXTENSIONS= (not set = allow all, default)
 */
export const ALLOWED_FILE_EXTENSIONS = {
  IMAGES: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
  DOCUMENTS: ['pdf', 'doc', 'docx', 'txt', 'rtf'],
  ARCHIVES: ['zip'],
  ALL: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'pdf', 'doc', 'docx', 'txt', 'rtf', 'zip']
}

/**
 * Get allowed file extensions from environment or return null for no restrictions
 * @returns {string[] | null} Array of allowed extensions or null if all are allowed
 */
export const getAllowedFileExtensions = () => {
  const envValue = process.env.ALLOWED_FILE_EXTENSIONS
  if (!envValue || envValue.trim() === '') {
    return null // No restrictions
  }
  return envValue.split(',').map(ext => ext.trim().toLowerCase())
}

export const MIME_TYPES = {
  // Images
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',

  // Documents
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  rtf: 'application/rtf',

  // Archives
  zip: 'application/zip'
}

// ============================================================================
// Authentication
// ============================================================================

export const TOKEN_EXPIRY = {
  ACCESS_TOKEN: process.env.JWT_EXPIRES_IN || '1h',
  REFRESH_TOKEN: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d'
}

export const PASSWORD_REQUIREMENTS = {
  MIN_LENGTH: 8,
  MAX_LENGTH: 128,
  REQUIRE_UPPERCASE: false,
  REQUIRE_LOWERCASE: false,
  REQUIRE_NUMBER: false,
  REQUIRE_SPECIAL: false
}

export const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12')

// ============================================================================
// Rate Limiting
// ============================================================================

export const RATE_LIMITS = {
  WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  MAX_REQUESTS: 100,
  AUTH: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: 5 // Stricter for auth endpoints
  }
}

// ============================================================================
// Pagination
// ============================================================================

export const PAGINATION = {
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
  DEFAULT_OFFSET: 0
}

// ============================================================================
// Database
// ============================================================================

export const DB_DEFAULTS = {
  TABLE_PREFIX: process.env.TABLE_PREFIX || 'hd_',
  CONNECTION_POOL: {
    MIN: 2,
    MAX: 10
  }
}

// ============================================================================
// Cache
// ============================================================================

export const CACHE_TTL = {
  SHORT: 300, // 5 minutes
  MEDIUM: 1800, // 30 minutes
  LONG: 3600, // 1 hour
  VERY_LONG: 86400 // 24 hours
}

export const CACHE_KEYS = {
  OPTIONS: 'options:all',
  ACTIVE_PLUGINS: 'plugins:active',
  ACTIVE_THEME: 'theme:active',
  POST_TYPES: 'post_types:all',
  TAXONOMIES: 'taxonomies:all',
  USER_CAPABILITIES: (userId) => `user:${userId}:capabilities`,
  POST: (idOrSlug) => `post:${idOrSlug}`,
  TERM: (idOrSlug) => `term:${idOrSlug}`
}

// ============================================================================
// Post Types
// ============================================================================

export const CORE_POST_TYPES = {
  POST: 'posts',
  PAGE: 'pages',
  ATTACHMENT: 'attachments',
  COMMENT: 'comments'
}

// ============================================================================
// Taxonomies
// ============================================================================

export const CORE_TAXONOMIES = {
  CATEGORY: 'categories',
  TAG: 'tags'
}

// ============================================================================
// Hooks & Filters
// ============================================================================

export const HOOK_PRIORITY = {
  HIGHEST: 1,
  HIGH: 5,
  DEFAULT: 10,
  LOW: 15,
  LOWEST: 20
}

export const CORE_HOOKS = {
  // System hooks
  INIT: 'init',
  SHUTDOWN: 'shutdown',

  // Post hooks
  CREATE_POST: 'create_post',
  SAVE_POST: 'save_post',
  DELETE_POST: 'delete_post',
  TRASH_POST: 'trash_post',
  RESTORE_POST: 'restore_post',

  // User hooks
  USER_LOGIN: 'user_login',
  USER_LOGOUT: 'user_logout',
  USER_REGISTER: 'user_register',
  USER_UPDATE: 'user_update',
  USER_DELETE: 'user_delete',

  // Upload hooks
  PRE_UPLOAD: 'pre_upload',
  AFTER_UPLOAD: 'after_upload',
  DELETE_ATTACHMENT: 'delete_attachment',

  // Plugin hooks
  PLUGIN_INSTALL: 'plugin_install',
  PLUGIN_ACTIVATE: 'plugin_activate',
  PLUGIN_DEACTIVATE: 'plugin_deactivate',
  PLUGIN_UNINSTALL: 'plugin_uninstall',
  PLUGIN_UPGRADE: 'plugin_upgrade',

  // Theme hooks
  THEME_INSTALL: 'theme_install',
  THEME_ACTIVATE: 'theme_activate',
  THEME_DEACTIVATE: 'theme_deactivate',
  THEME_UNINSTALL: 'theme_uninstall'
}

export const CORE_FILTERS = {
  // Content filters
  THE_CONTENT: 'the_content',
  THE_TITLE: 'the_title',
  THE_EXCERPT: 'the_excerpt',

  // Query filters
  POST_QUERY: 'post_query',
  TERM_QUERY: 'term_query',
  USER_QUERY: 'user_query',

  // Response filters
  REST_RESPONSE: 'rest_response',
  API_ERROR: 'api_error',

  // Upload filters
  UPLOAD_DIR: 'upload_dir',
  UPLOAD_FILENAME: 'upload_filename',

  // Menu filters
  MENU_ITEMS: 'menu_items',

  // Authentication filters
  AUTHENTICATE: 'authenticate',
  AUTHORIZE: 'authorize'
}

// ============================================================================
// Field Types
// ============================================================================

export const FIELD_TYPES = {
  TEXT: 'text',
  TEXTAREA: 'textarea',
  RICH_TEXT: 'rich_text',
  NUMBER: 'number',
  CHECKBOX: 'checkbox',
  SELECT: 'select',
  RADIO: 'radio',
  IMAGE: 'image',
  FILE: 'file',
  DATE: 'date',
  DATETIME: 'datetime',
  REPEATER: 'repeater',
  RELATIONSHIP: 'relationship'
}

// ============================================================================
// Meta Query Operators
// ============================================================================

export const META_QUERY_OPERATORS = {
  EQUALS: '=',
  NOT_EQUALS: '!=',
  GREATER_THAN: '>',
  LESS_THAN: '<',
  GREATER_THAN_OR_EQUAL: '>=',
  LESS_THAN_OR_EQUAL: '<=',
  LIKE: 'LIKE',
  IN: 'IN',
  NOT_IN: 'NOT IN'
}

// ============================================================================
// Logging
// ============================================================================

export const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
}

// ============================================================================
// Errors
// ============================================================================

export const ERROR_CODES = {
  // Authentication errors
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',

  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',

  // Resource errors
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',

  // Database errors
  DATABASE_ERROR: 'DATABASE_ERROR',
  QUERY_ERROR: 'QUERY_ERROR',

  // File errors
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  UPLOAD_ERROR: 'UPLOAD_ERROR',

  // Plugin/Theme errors
  PLUGIN_NOT_FOUND: 'PLUGIN_NOT_FOUND',
  PLUGIN_ALREADY_ACTIVE: 'PLUGIN_ALREADY_ACTIVE',
  PLUGIN_ALREADY_INACTIVE: 'PLUGIN_ALREADY_INACTIVE',
  MISSING_DEPENDENCIES: 'MISSING_DEPENDENCIES',
  HAS_DEPENDENTS: 'HAS_DEPENDENTS',

  // Generic errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE'
}

export const ERROR_MESSAGES = {
  [ERROR_CODES.INVALID_CREDENTIALS]: 'Invalid email or password',
  [ERROR_CODES.TOKEN_EXPIRED]: 'Token has expired',
  [ERROR_CODES.TOKEN_INVALID]: 'Invalid token',
  [ERROR_CODES.UNAUTHORIZED]: 'Authentication required',
  [ERROR_CODES.FORBIDDEN]: 'You do not have permission to perform this action',
  [ERROR_CODES.NOT_FOUND]: 'Resource not found',
  [ERROR_CODES.ALREADY_EXISTS]: 'Resource already exists',
  [ERROR_CODES.VALIDATION_ERROR]: 'Validation failed',
  [ERROR_CODES.FILE_TOO_LARGE]: 'File size exceeds the maximum allowed',
  [ERROR_CODES.INVALID_FILE_TYPE]: 'File type not allowed',
  [ERROR_CODES.INTERNAL_ERROR]: 'An internal error occurred',
  [ERROR_CODES.DATABASE_ERROR]: 'Database operation failed',
  [ERROR_CODES.MISSING_DEPENDENCIES]: 'Missing required dependencies',
  [ERROR_CODES.HAS_DEPENDENTS]: 'Cannot perform action: other resources depend on this'
}

// ============================================================================
// Environment
// ============================================================================

export const ENVIRONMENTS = {
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
  TEST: 'test'
}

export const IS_PRODUCTION = process.env.NODE_ENV === ENVIRONMENTS.PRODUCTION
export const IS_DEVELOPMENT = process.env.NODE_ENV === ENVIRONMENTS.DEVELOPMENT
export const IS_TEST = process.env.NODE_ENV === ENVIRONMENTS.TEST

// ============================================================================
// Paths
// ============================================================================

export const PATHS = {
  CONTENT_DIR: './content',
  PLUGINS_DIR: './content/plugins',
  THEMES_DIR: './content/themes',
  UPLOADS_DIR: process.env.UPLOAD_DIR || './content/uploads',
  CONFIG_DIR: './content/config',
  LOGS_DIR: './logs',
  TEMP_DIR: './content/.temp',
  BACKUPS_DIR: './content/.backups'
}

// ============================================================================
// API Versions
// ============================================================================

export const API_VERSIONS = {
  V1: 'v1'
}

export const CURRENT_API_VERSION = API_VERSIONS.V1

// ============================================================================
// Admin
// ============================================================================

export const ADMIN = {
  PATH: process.env.ADMIN_PATH || '/admin',
  DEFAULT_ITEMS_PER_PAGE: 10
}

// ============================================================================
// Clustering
// ============================================================================

export const CLUSTER_WORKERS = parseInt(process.env.CLUSTER_WORKERS || '0') // 0 = auto (CPU count)

// ============================================================================
// Date Formats
// ============================================================================

export const DATE_FORMATS = {
  DISPLAY: 'YYYY-MM-DD HH:mm:ss',
  ISO: 'YYYY-MM-DDTHH:mm:ss.sssZ',
  SHORT: 'YYYY-MM-DD',
  TIME: 'HH:mm:ss'
}

// ============================================================================
// Regex Patterns
// ============================================================================

export const REGEX_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  SLUG: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  URL: /^https?:\/\/.+/,
  HEX_COLOR: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
  SEMVER: /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
}

// ============================================================================
// WebSocket Events
// ============================================================================

export const WS_EVENTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  POST_UPDATED: 'post_updated',
  POST_CREATED: 'post_created',
  POST_DELETED: 'post_deleted',
  USER_ONLINE: 'user_online',
  USER_OFFLINE: 'user_offline',
  NOTIFICATION: 'notification'
}

// ============================================================================
// Export All
// ============================================================================

export default {
  HTTP_STATUS,
  POST_STATUS,
  VALID_POST_STATUSES,
  USER_ROLES,
  CAPABILITIES,
  UPLOAD_LIMITS,
  ALLOWED_FILE_EXTENSIONS,
  getAllowedFileExtensions,
  MIME_TYPES,
  TOKEN_EXPIRY,
  PASSWORD_REQUIREMENTS,
  BCRYPT_ROUNDS,
  RATE_LIMITS,
  PAGINATION,
  DB_DEFAULTS,
  CACHE_TTL,
  CACHE_KEYS,
  CORE_POST_TYPES,
  CORE_TAXONOMIES,
  HOOK_PRIORITY,
  CORE_HOOKS,
  CORE_FILTERS,
  FIELD_TYPES,
  META_QUERY_OPERATORS,
  LOG_LEVELS,
  ERROR_CODES,
  ERROR_MESSAGES,
  ENVIRONMENTS,
  IS_PRODUCTION,
  IS_DEVELOPMENT,
  IS_TEST,
  PATHS,
  API_VERSIONS,
  CURRENT_API_VERSION,
  ADMIN,
  CLUSTER_WORKERS,
  DATE_FORMATS,
  REGEX_PATTERNS,
  WS_EVENTS
}
