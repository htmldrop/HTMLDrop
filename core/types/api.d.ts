/**
 * API Response Types
 */

declare global {
  namespace HTMLDrop {
    interface ListResponse<T> {
      items: T[]
      total: number
      total_current?: number
      total_drafts?: number
      total_published?: number
      total_trashed?: number
      limit: number
      offset: number
    }

    interface ErrorResponse {
      error: string
      code?: string
      details?: any
    }

    interface SuccessResponse {
      message: string
      data?: any
    }

    interface UploadedFile {
      fieldname: string
      originalname: string
      encoding: string
      mimetype: string
      destination: string
      filename: string
      path: string
      size: number
    }

    interface AttachmentMeta {
      width?: number
      height?: number
      alt?: string
      caption?: string
      thumbnails?: Record<string, string>
    }

    interface Option {
      id: number
      name: string
      value: any
      autoload: boolean
    }

    interface CacheService {
      get<T = any>(key: string): Promise<T | null>
      set(key: string, value: any, ttl?: number): Promise<void>
      del(key: string): Promise<void>
      flush(): Promise<void>
      has(key: string): Promise<boolean>
    }

    interface Constants {
      HTTP_STATUS: Record<string, number>
      POST_STATUS: Record<string, string>
      USER_ROLES: Record<string, string>
      CAPABILITIES: Record<string, string>
      UPLOAD_LIMITS: Record<string, number>
      ALLOWED_FILE_EXTENSIONS: Record<string, string[]>
      getAllowedFileExtensions: () => string[] | null
      MIME_TYPES: Record<string, string>
      TOKEN_EXPIRY: Record<string, string>
      RATE_LIMITS: Record<string, number | Record<string, number>>
      PAGINATION: Record<string, number>
      CACHE_TTL: Record<string, number>
      ERROR_CODES: Record<string, string>
      ERROR_MESSAGES: Record<string, string>
    }

    /**
     * Email sending options
     */
    interface EmailOptions {
      to: string | string[]
      subject: string
      html?: string
      text?: string
      from?: string
      replyTo?: string
      cc?: string | string[]
      bcc?: string | string[]
      attachments?: Array<{
        filename: string
        content?: string | Buffer
        path?: string
        contentType?: string
      }>
    }

    /**
     * Email sending result
     */
    interface EmailResult {
      success: boolean
      messageId?: string
      error?: string
    }
  }
}

export {}
