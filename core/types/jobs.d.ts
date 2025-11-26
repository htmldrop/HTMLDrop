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
      payload?: Record<string, any>
      source?: string
      priority?: number
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
      type: string
      name: string
      status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
      payload: Record<string, any>
      result?: any
      error?: string
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
