import { CronJob } from 'cron'
import type { Knex } from 'knex'

/**
 * Laravel-style Task Scheduler for HTMLDrop
 *
 * Features:
 * - Single-worker execution (uses database locking)
 * - Fluent API for scheduling (everyMinute(), hourly(), daily(), etc.)
 * - Integrates with jobs registry for topbar visibility
 * - Can be extended by plugins/themes
 *
 * Usage:
 *   scheduler.call(async () => { ... }).everyMinute()
 *   scheduler.call(async () => { ... }).hourly()
 *   scheduler.call(async () => { ... }).daily()
 *   scheduler.call(async () => { ... }).cron('0 0 * * *')
 */

interface SchedulerContext {
  knex?: Knex | null
  table: (name: string) => string
  registries?: {
    jobs?: any
  }
}

interface TaskMetadata {
  name: string
  owner: string | null
  schedule: string | null
  withoutOverlapping: boolean
}

class ScheduledTask {
  private callback: () => Promise<void>
  private context: SchedulerContext
  public name: string
  private _owner: string | null
  public cronExpression: string | null = null
  private job: CronJob | null = null
  public withoutOverlapping: boolean = true

  constructor(callback: () => Promise<void>, context: SchedulerContext, name: string | null = null, owner: string | null = null) {
    this.callback = callback
    this.context = context
    this.name = name || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Owner is immutable - once set during construction, it cannot be changed
    // This prevents plugins from overriding ownership
    this._owner = owner
  }

  // Owner is immutable via getter/setter
  get owner(): string | null {
    return this._owner
  }

  set owner(value: string | null) {
    throw new Error('Cannot modify owner after task creation')
  }

  /**
   * Set a custom cron expression
   */
  cron(expression: string): this {
    this.cronExpression = expression
    return this
  }

  /**
   * Run every minute
   */
  everyMinute(): this {
    this.cronExpression = '* * * * *'
    return this
  }

  /**
   * Run every N minutes
   */
  everyNMinutes(n: number): this {
    this.cronExpression = `*/${n} * * * *`
    return this
  }

  /**
   * Run every 2 minutes
   */
  everyTwoMinutes(): this {
    return this.everyNMinutes(2)
  }

  /**
   * Run every 5 minutes
   */
  everyFiveMinutes(): this {
    return this.everyNMinutes(5)
  }

  /**
   * Run every 10 minutes
   */
  everyTenMinutes(): this {
    return this.everyNMinutes(10)
  }

  /**
   * Run every 15 minutes
   */
  everyFifteenMinutes(): this {
    return this.everyNMinutes(15)
  }

  /**
   * Run every 30 minutes
   */
  everyThirtyMinutes(): this {
    return this.everyNMinutes(30)
  }

  /**
   * Run hourly at the start of the hour
   */
  hourly(): this {
    this.cronExpression = '0 * * * *'
    return this
  }

  /**
   * Run hourly at a specific minute
   */
  hourlyAt(minute: number): this {
    this.cronExpression = `${minute} * * * *`
    return this
  }

  /**
   * Run daily at midnight
   */
  daily(): this {
    this.cronExpression = '0 0 * * *'
    return this
  }

  /**
   * Run daily at a specific time (24-hour format)
   */
  dailyAt(time: string): this {
    const [hour, minute = '0'] = time.split(':')
    this.cronExpression = `${minute} ${hour} * * *`
    return this
  }

  /**
   * Run weekly on Sunday at midnight
   */
  weekly(): this {
    this.cronExpression = '0 0 * * 0'
    return this
  }

  /**
   * Run monthly on the first day at midnight
   */
  monthly(): this {
    this.cronExpression = '0 0 1 * *'
    return this
  }

  /**
   * Allow overlapping executions (default is false)
   */
  allowOverlapping(): this {
    this.withoutOverlapping = false
    return this
  }

  /**
   * Set a custom name for this task
   */
  named(name: string): this {
    this.name = name
    return this
  }

  /**
   * Start the scheduled task
   */
  start(): void {
    if (!this.cronExpression) {
      throw new Error(`No schedule defined for task: ${this.name}`)
    }

    this.job = new CronJob(
      this.cronExpression,
      async () => {
        await this._execute()
      },
      null,
      true,
      'UTC'
    )

    console.log(`[Scheduler] Started task: ${this.name} (${this.cronExpression})`)
  }

  /**
   * Execute the task with database locking (single-worker execution)
   */
  private async _execute(): Promise<void> {
    const { knex, table } = this.context
    if (!knex) return
    const lockName = `scheduler_lock_${this.name}`
    const now = Date.now()
    const lockTimeout = 60000 // 1 minute lock timeout

    try {
      // Try to acquire lock using database
      const lock = await knex(table('options')).where('name', lockName).first()

      if (lock?.value) {
        const lockData = JSON.parse(lock.value)

        // Check if lock is still valid
        if (this.withoutOverlapping && lockData.locked_at && now - lockData.locked_at < lockTimeout) {
          console.log(`[Scheduler] Task ${this.name} is already running, skipping...`)
          return
        }
      }

      // Acquire or update lock
      const lockData = JSON.stringify({ locked_at: now, worker_pid: process.pid })

      if (lock) {
        await knex(table('options'))
          .where('name', lockName)
          .update({ value: lockData, updated_at: knex.fn.now() })
      } else {
        await knex(table('options')).insert({
          name: lockName,
          value: lockData
        })
      }

      // Register job in jobs registry (for topbar visibility)
      const jobId = `scheduled_${this.name}_${now}`
      const jobsRegistry = this.context.registries?.jobs

      if (jobsRegistry) {
        await jobsRegistry.create({
          id: jobId,
          type: 'scheduled_task',
          title: `Scheduled: ${this.name}`,
          status: 'processing',
          progress: 0,
          metadata: { task_name: this.name }
        })
      }

      console.log(`[Scheduler] Executing task: ${this.name}`)

      // Execute the callback
      await this.callback()

      // Update job status to completed
      if (jobsRegistry) {
        await jobsRegistry.update(jobId, {
          status: 'completed',
          progress: 100,
          completed_at: new Date()
        })
      }

      console.log(`[Scheduler] Completed task: ${this.name}`)

    } catch (error) {
      console.error(`[Scheduler] Error executing task ${this.name}:`, error)

      // Update job status to failed
      const jobId = `scheduled_${this.name}_${now}`
      const jobsRegistry = this.context.registries?.jobs

      if (jobsRegistry) {
        await jobsRegistry.update(jobId, {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          completed_at: new Date()
        })
      }
    } finally {
      // Release lock
      try {
        await knex(table('options')).where('name', lockName).delete()
      } catch (err) {
        console.error(`[Scheduler] Failed to release lock for ${this.name}:`, err)
      }
    }
  }

  /**
   * Stop the scheduled task
   */
  stop(): void {
    if (this.job) {
      this.job.stop()
      console.log(`[Scheduler] Stopped task: ${this.name}`)
    }
  }
}

export default class SchedulerService {
  private context: SchedulerContext
  public tasks: ScheduledTask[] = []
  private canExecute: boolean
  private _currentOwner: string | null = null

  constructor(context: SchedulerContext, canExecute = false) {
    this.context = context
    this.canExecute = canExecute // Only true for worker 1
  }

  /**
   * INTERNAL: Set the current owner (plugin/theme slug) for subsequently registered tasks
   * This is called automatically by plugin/theme lifecycle system
   * DO NOT call this directly from plugins/themes - it's managed automatically
   * @internal
   */
  _setOwner(owner: string): void {
    this._currentOwner = owner
  }

  /**
   * INTERNAL: Clear the current owner
   * This is called automatically by plugin/theme lifecycle system
   * DO NOT call this directly from plugins/themes - it's managed automatically
   * @internal
   */
  _clearOwner(): void {
    this._currentOwner = null
  }

  /**
   * Schedule a callback function
   */
  call(callback: () => Promise<void>, name: string | null = null): ScheduledTask {
    const task = new ScheduledTask(callback, this.context, name, this._currentOwner)
    this.tasks.push(task)

    // If this worker can execute, register the task in the database for sync
    if (this.canExecute) {
      this._registerTaskInDb(task).catch(err => {
        console.error(`[Scheduler] Failed to register task ${task.name} in database:`, err)
      })
    }

    return task
  }

  /**
   * Register task metadata in database for cross-worker visibility
   */
  private async _registerTaskInDb(task: ScheduledTask): Promise<void> {
    const { knex, table } = this.context
    if (!knex) return

    try {
      const taskData = JSON.stringify({
        name: task.name,
        owner: task.owner,
        schedule: task.cronExpression,
        withoutOverlapping: task.withoutOverlapping,
        registered_at: Date.now()
      })

      const exists = await knex(table('options'))
        .where('name', `scheduler_task_${task.name}`)
        .first()

      if (exists) {
        await knex(table('options'))
          .where('name', `scheduler_task_${task.name}`)
          .update({ value: taskData, updated_at: knex.fn.now() })
      } else {
        await knex(table('options')).insert({
          name: `scheduler_task_${task.name}`,
          value: taskData
        })
      }
    } catch (error) {
      console.error(`[Scheduler] Failed to register task ${task.name}:`, error)
    }
  }

  /**
   * Start all scheduled tasks (only on execution worker)
   */
  startAll(): void {
    if (!this.canExecute) {
      // Don't log - this is expected on non-execution workers
      return
    }

    console.log(`[Scheduler] Starting ${this.tasks.length} scheduled task(s)...`)

    for (const task of this.tasks) {
      try {
        task.start()
      } catch (error) {
        console.error(`[Scheduler] Failed to start task ${task.name}:`, error)
      }
    }
  }

  /**
   * Stop all scheduled tasks
   */
  stopAll(): void {
    console.log('[Scheduler] Stopping all scheduled tasks...')

    for (const task of this.tasks) {
      try {
        task.stop()
      } catch (error) {
        console.error(`[Scheduler] Failed to stop task ${task.name}:`, error)
      }
    }

    this.tasks = []
  }

  /**
   * Stop and remove all tasks owned by a specific plugin or theme
   * This is called automatically when a plugin/theme is deactivated or uninstalled
   */
  async teardownTasksByOwner(owner: string): Promise<void> {
    if (!owner) {
      console.warn('[Scheduler] Cannot teardown tasks: no owner specified')
      return
    }

    const tasksToRemove = this.tasks.filter(task => task.owner === owner)

    if (tasksToRemove.length === 0) {
      console.log(`[Scheduler] No tasks found for owner: ${owner}`)
      return
    }

    console.log(`[Scheduler] Tearing down ${tasksToRemove.length} task(s) for owner: ${owner}`)

    for (const task of tasksToRemove) {
      try {
        // Stop the cron job
        task.stop()

        // Remove from tasks array
        const index = this.tasks.indexOf(task)
        if (index > -1) {
          this.tasks.splice(index, 1)
        }

        // Remove from database (only on execution worker)
        if (this.canExecute) {
          await this._unregisterTaskFromDb(task)
        }

        console.log(`[Scheduler] Removed task: ${task.name}`)
      } catch (error) {
        console.error(`[Scheduler] Failed to remove task ${task.name}:`, error)
      }
    }
  }

  /**
   * Remove task metadata from database
   */
  private async _unregisterTaskFromDb(task: ScheduledTask): Promise<void> {
    const { knex, table } = this.context
    if (!knex) return

    try {
      await knex(table('options'))
        .where('name', `scheduler_task_${task.name}`)
        .delete()
    } catch (error) {
      console.error(`[Scheduler] Failed to unregister task ${task.name} from database:`, error)
    }
  }

  /**
   * Get all registered tasks
   */
  getTasks(): TaskMetadata[] {
    return this.tasks.map(task => ({
      name: task.name,
      owner: task.owner,
      schedule: task.cronExpression,
      withoutOverlapping: task.withoutOverlapping
    }))
  }

  /**
   * Get tasks owned by a specific plugin or theme
   */
  getTasksByOwner(owner: string): TaskMetadata[] {
    return this.tasks
      .filter(task => task.owner === owner)
      .map(task => ({
        name: task.name,
        owner: task.owner,
        schedule: task.cronExpression,
        withoutOverlapping: task.withoutOverlapping
      }))
  }
}
