/**
 * Performance Tracing Types
 */

declare global {
  namespace HTMLDrop {
    interface TraceSpan {
      id: string
      name: string
      category: string
      tags: Record<string, any>
      duration: number | null
      status: 'running' | 'completed' | 'error'
      end(options?: { error?: Error }): TraceSpan
      addTag(key: string, value: any): TraceSpan
      addTags(tags: Record<string, any>): TraceSpan
    }

    interface PerformanceTracer {
      traceId: string
      enabled: boolean
      startSpan(name: string, options?: { category?: string; tags?: Record<string, any> }): TraceSpan
      trace<T>(name: string, fn: (span: TraceSpan) => Promise<T>, options?: { category?: string }): Promise<T>
      getCurrentSpan(): TraceSpan | null
      setRequest(req: any): void
      end(): void
      toJSON(): object
      toString(): string
    }

    /**
     * Stored trace record (from traces table)
     */
    interface Trace {
      id: number
      trace_id: string
      request_method?: string
      request_path?: string
      request_url?: string
      user_id?: number
      total_duration?: number
      span_count?: number
      error_count?: number
      summary?: Record<string, any>
      spans?: TraceSpan[]
      waterfall?: Record<string, any>
      metadata?: Record<string, any>
      created_at: string
    }

    /**
     * Trace storage service interface
     */
    interface TraceStorage {
      store(trace: object): Promise<void> | void
      get(traceId: string): Promise<Trace | null>
      getRecent(options?: {
        limit?: number
        offset?: number
        path?: string
        minDuration?: number
        errorsOnly?: boolean
      }): Promise<Trace[]>
      getSlowest(limit?: number, hoursBack?: number): Promise<Trace[]>
      getErrors(limit?: number, hoursBack?: number): Promise<Trace[]>
      count(): Promise<number>
      clear(): Promise<void>
      cleanup(): Promise<void>
      toJSON(limit?: number): Promise<string>
    }
  }
}

export {}
