/**
 * Background Jobs Types
 */

declare global {
  namespace HTMLDrop {
    /**
     * Job configuration for creating background jobs
     */
    interface JobConfig {
      type: string
      name: string
      description?: string
      iconSvg?: string
      payload?: Record<string, any>
      metadata?: Record<string, any>
      source?: string
      priority?: number
      createdBy?: number | null
      showNotification?: boolean
      timeout?: number
    }

    /**
     * Job query options
     */
    interface JobQueryOptions {
      status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
      type?: string
      source?: string
      limit?: number
      offset?: number
    }

    /**
     * Background job instance
     */
    interface Job {
      id: number
      jobId: string
      type: string
      name: string
      status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
      payload: Record<string, any>
      result?: any
      error?: string
      description?: string
      icon_svg?: string
      progress: number
      metadata?: Record<string, any>
      source?: string
      priority: number
      attempts: number
      max_attempts: number
      created_at: string
      started_at?: string
      completed_at?: string
      start(): Promise<void>
      updateProgress(progress: number, metadata?: Record<string, any>): Promise<void>
      complete(result?: any): Promise<void>
      fail(errorMessage: string): Promise<void>
      cancel(): Promise<void>
    }
  }
}

export {}
