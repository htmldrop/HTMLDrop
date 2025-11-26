/**
 * Scheduler Service Types
 *
 * Laravel-style task scheduler for running scheduled jobs
 */

declare global {
  namespace HTMLDrop {
    /**
     * Laravel-style task scheduler for running scheduled jobs
     *
     * @example
     * // Schedule a task to run every 2 minutes
     * scheduler
     *   .call(async () => {
     *     console.log('Running scheduled task')
     *   }, 'my_task')
     *   .everyTwoMinutes()
     *
     * // Schedule a daily task at specific time
     * scheduler
     *   .call(async () => {
     *     console.log('Running daily cleanup')
     *   }, 'daily_cleanup')
     *   .dailyAt('02:00')
     */
    interface SchedulerService {
      /**
       * INTERNAL: Set the current owner (plugin/theme slug) for subsequently registered tasks
       * @internal
       */
      _setOwner(owner: string): void

      /**
       * INTERNAL: Clear the current owner
       * @internal
       */
      _clearOwner(): void

      /**
       * Schedule a callback function to run on a schedule
       * @param callback - The function to execute
       * @param name - Optional unique name for the task
       * @returns A ScheduledTask that can be configured with timing methods
       */
      call(callback: () => Promise<void> | void, name?: string): ScheduledTask

      /**
       * Start all registered scheduled tasks
       */
      startAll(): void

      /**
       * Stop all scheduled tasks
       */
      stopAll(): void

      /**
       * Stop and remove all tasks owned by a specific plugin or theme
       * @param owner - Plugin or theme slug
       */
      teardownTasksByOwner(owner: string): Promise<void>

      /**
       * Get all registered tasks
       * @returns Array of task metadata
       */
      getTasks(): Array<{
        name: string
        owner: string | null
        schedule: string
        withoutOverlapping: boolean
      }>

      /**
       * Get tasks owned by a specific plugin or theme
       * @param owner - Plugin or theme slug
       */
      getTasksByOwner(owner: string): Array<{
        name: string
        owner: string | null
        schedule: string
        withoutOverlapping: boolean
      }>
    }

    /**
     * A scheduled task with fluent configuration methods
     */
    interface ScheduledTask {
      /** Set a custom cron expression */
      cron(expression: string): ScheduledTask

      /** Run every minute */
      everyMinute(): ScheduledTask

      /** Run every N minutes */
      everyNMinutes(n: number): ScheduledTask

      /** Run every 2 minutes */
      everyTwoMinutes(): ScheduledTask

      /** Run every 5 minutes */
      everyFiveMinutes(): ScheduledTask

      /** Run every 10 minutes */
      everyTenMinutes(): ScheduledTask

      /** Run every 15 minutes */
      everyFifteenMinutes(): ScheduledTask

      /** Run every 30 minutes */
      everyThirtyMinutes(): ScheduledTask

      /** Run hourly at the start of the hour */
      hourly(): ScheduledTask

      /** Run hourly at a specific minute */
      hourlyAt(minute: number): ScheduledTask

      /** Run daily at midnight */
      daily(): ScheduledTask

      /** Run daily at a specific time (24-hour format) */
      dailyAt(time: string): ScheduledTask

      /** Run weekly on Sunday at midnight */
      weekly(): ScheduledTask

      /** Run monthly on the first day at midnight */
      monthly(): ScheduledTask

      /** Allow overlapping executions */
      allowOverlapping(): ScheduledTask

      /** Set a custom name for this task */
      named(name: string): ScheduledTask

      /** Start the scheduled task */
      start(): void

      /** Stop the scheduled task */
      stop(): void
    }
  }
}

export {}
