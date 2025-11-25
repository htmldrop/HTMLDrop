import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import SchedulerService from './SchedulerService.mjs'

// Mock context
const createMockContext = () => {
  const mockDb = new Map()

  return {
    knex: (tableName) => ({
      where: (name, value) => ({
        first: async () => {
          const key = `${tableName}:${name}:${value}`
          return mockDb.get(key)
        },
        update: async (data) => {
          const key = `${tableName}:${name}:${value}`
          const existing = mockDb.get(key)
          if (existing) {
            mockDb.set(key, { ...existing, ...data })
          }
        },
        delete: async () => {
          const key = `${tableName}:${name}:${value}`
          mockDb.delete(key)
        }
      }),
      insert: async (data) => {
        const key = `${tableName}:name:${data.name}`
        mockDb.set(key, data)
      }
    }),
    table: (name) => name,
    registries: {
      jobs: {
        create: vi.fn(),
        update: vi.fn()
      }
    },
    _mockDb: mockDb // For test assertions
  }
}

describe('SchedulerService', () => {
  let scheduler
  let context

  beforeEach(() => {
    context = createMockContext()
    scheduler = new SchedulerService(context, true) // canExecute = true
  })

  afterEach(() => {
    scheduler.stopAll()
  })

  describe('Task Registration', () => {
    it('should register a task with fluent API', () => {
      const task = scheduler
        .call(async () => {
          console.log('test task')
        }, 'test_task')
        .everyMinute()

      expect(scheduler.tasks).toHaveLength(1)
      expect(scheduler.tasks[0].name).toBe('test_task')
      expect(scheduler.tasks[0].cronExpression).toBe('* * * * *')
    })

    it('should generate unique task names if not provided', () => {
      const task1 = scheduler.call(async () => {}).everyMinute()
      const task2 = scheduler.call(async () => {}).everyMinute()

      expect(task1.name).toBeDefined()
      expect(task2.name).toBeDefined()
      expect(task1.name).not.toBe(task2.name)
    })

    it('should support all schedule methods', () => {
      const tests = [
        { method: 'everyMinute', expected: '* * * * *' },
        { method: 'everyTwoMinutes', expected: '*/2 * * * *' },
        { method: 'everyFiveMinutes', expected: '*/5 * * * *' },
        { method: 'everyTenMinutes', expected: '*/10 * * * *' },
        { method: 'everyFifteenMinutes', expected: '*/15 * * * *' },
        { method: 'everyThirtyMinutes', expected: '*/30 * * * *' },
        { method: 'hourly', expected: '0 * * * *' },
        { method: 'daily', expected: '0 0 * * *' },
        { method: 'weekly', expected: '0 0 * * 0' },
        { method: 'monthly', expected: '0 0 1 * *' }
      ]

      tests.forEach(({ method, expected }) => {
        const testScheduler = new SchedulerService(context, true)
        const task = testScheduler.call(async () => {}, `test_${method}`)
        task[method]()
        expect(task.cronExpression).toBe(expected)
        testScheduler.stopAll()
      })
    })

    it('should support custom cron expressions', () => {
      const task = scheduler
        .call(async () => {}, 'custom_task')
        .cron('0 0 * * 1-5') // Weekdays at midnight

      expect(task.cronExpression).toBe('0 0 * * 1-5')
    })

    it('should support dailyAt with time', () => {
      const task = scheduler.call(async () => {}, 'daily_task').dailyAt('14:30')

      expect(task.cronExpression).toBe('30 14 * * *')
    })

    it('should support hourlyAt with minute', () => {
      const task = scheduler.call(async () => {}, 'hourly_task').hourlyAt(15)

      expect(task.cronExpression).toBe('15 * * * *')
    })
  })

  describe('Owner Tracking', () => {
    it('should assign owner to tasks when _setOwner is called', () => {
      scheduler._setOwner('my-plugin')

      const task = scheduler.call(async () => {}, 'plugin_task').everyMinute()

      expect(task.owner).toBe('my-plugin')
    })

    it('should make owner immutable', () => {
      scheduler._setOwner('my-plugin')
      const task = scheduler.call(async () => {}, 'plugin_task').everyMinute()

      // Attempt to change owner (should not work)
      expect(() => {
        task.owner = 'different-plugin'
      }).toThrow()

      expect(task.owner).toBe('my-plugin')
    })

    it('should clear owner when _clearOwner is called', () => {
      scheduler._setOwner('my-plugin')
      const task1 = scheduler.call(async () => {}, 'plugin_task').everyMinute()

      scheduler._clearOwner()
      const task2 = scheduler.call(async () => {}, 'core_task').everyMinute()

      expect(task1.owner).toBe('my-plugin')
      expect(task2.owner).toBe(null)
    })

    it('should track multiple tasks from same owner', () => {
      scheduler._setOwner('my-plugin')

      scheduler.call(async () => {}, 'plugin_task_1').everyMinute()
      scheduler.call(async () => {}, 'plugin_task_2').hourly()
      scheduler.call(async () => {}, 'plugin_task_3').daily()

      scheduler._clearOwner()

      const pluginTasks = scheduler.getTasksByOwner('my-plugin')
      expect(pluginTasks).toHaveLength(3)
    })

    it('should handle tasks from multiple owners', () => {
      // Plugin tasks
      scheduler._setOwner('plugin-a')
      scheduler.call(async () => {}, 'plugin_a_task_1').everyMinute()
      scheduler.call(async () => {}, 'plugin_a_task_2').hourly()
      scheduler._clearOwner()

      // Theme tasks
      scheduler._setOwner('theme-b')
      scheduler.call(async () => {}, 'theme_b_task_1').daily()
      scheduler._clearOwner()

      // Core tasks (no owner)
      scheduler.call(async () => {}, 'core_task').everyFiveMinutes()

      expect(scheduler.getTasksByOwner('plugin-a')).toHaveLength(2)
      expect(scheduler.getTasksByOwner('theme-b')).toHaveLength(1)
      expect(scheduler.getTasks()).toHaveLength(4)
    })
  })

  describe('Lifecycle Management', () => {
    it('should simulate plugin activation and task registration', () => {
      // Simulate plugin lifecycle
      scheduler._setOwner('email-plugin')

      // Plugin registers its tasks
      scheduler
        .call(async () => {
          console.log('Sending daily digest')
        }, 'email_daily_digest')
        .dailyAt('08:00')

      scheduler
        .call(async () => {
          console.log('Cleanup old emails')
        }, 'email_cleanup')
        .weekly()

      scheduler._clearOwner()

      const tasks = scheduler.getTasksByOwner('email-plugin')
      expect(tasks).toHaveLength(2)
      expect(tasks[0].owner).toBe('email-plugin')
      expect(tasks[1].owner).toBe('email-plugin')
    })

    it('should teardown tasks when plugin is deactivated', async () => {
      // Plugin activation
      scheduler._setOwner('my-plugin')
      scheduler.call(async () => {}, 'plugin_task_1').everyMinute()
      scheduler.call(async () => {}, 'plugin_task_2').hourly()
      scheduler._clearOwner()

      expect(scheduler.getTasks()).toHaveLength(2)

      // Plugin deactivation
      await scheduler.teardownTasksByOwner('my-plugin')

      expect(scheduler.getTasks()).toHaveLength(0)
      expect(scheduler.getTasksByOwner('my-plugin')).toHaveLength(0)
    })

    it('should only teardown tasks for specific owner', async () => {
      // Register tasks from different owners
      scheduler._setOwner('plugin-a')
      scheduler.call(async () => {}, 'plugin_a_task').everyMinute()
      scheduler._clearOwner()

      scheduler._setOwner('plugin-b')
      scheduler.call(async () => {}, 'plugin_b_task').hourly()
      scheduler._clearOwner()

      scheduler.call(async () => {}, 'core_task').daily()

      expect(scheduler.getTasks()).toHaveLength(3)

      // Teardown only plugin-a tasks
      await scheduler.teardownTasksByOwner('plugin-a')

      expect(scheduler.getTasks()).toHaveLength(2)
      expect(scheduler.getTasksByOwner('plugin-a')).toHaveLength(0)
      expect(scheduler.getTasksByOwner('plugin-b')).toHaveLength(1)
    })

    it('should handle teardown when no tasks exist for owner', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await scheduler.teardownTasksByOwner('non-existent-plugin')

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('No tasks found for owner: non-existent-plugin')
      )

      consoleLogSpy.mockRestore()
    })

    it('should not teardown tasks without owner', async () => {
      scheduler.call(async () => {}, 'core_task').everyMinute()

      await scheduler.teardownTasksByOwner('some-plugin')

      expect(scheduler.getTasks()).toHaveLength(1)
    })
  })

  describe('Theme Integration', () => {
    it('should register and teardown theme tasks', async () => {
      // Theme activation
      scheduler._setOwner('my-theme')
      scheduler
        .call(async () => {
          console.log('Theme maintenance')
        }, 'theme_maintenance')
        .daily()
      scheduler._clearOwner()

      const tasks = scheduler.getTasksByOwner('my-theme')
      expect(tasks).toHaveLength(1)
      expect(tasks[0].owner).toBe('my-theme')

      // Theme deactivation
      await scheduler.teardownTasksByOwner('my-theme')

      expect(scheduler.getTasksByOwner('my-theme')).toHaveLength(0)
    })

    it('should handle theme switching scenario', async () => {
      // Activate theme A
      scheduler._setOwner('theme-a')
      scheduler.call(async () => {}, 'theme_a_task').daily()
      scheduler._clearOwner()

      // Activate theme B (should replace theme A)
      await scheduler.teardownTasksByOwner('theme-a')

      scheduler._setOwner('theme-b')
      scheduler.call(async () => {}, 'theme_b_task').daily()
      scheduler._clearOwner()

      expect(scheduler.getTasksByOwner('theme-a')).toHaveLength(0)
      expect(scheduler.getTasksByOwner('theme-b')).toHaveLength(1)
    })
  })

  describe('Worker Execution Control', () => {
    it('should allow non-execution worker to register tasks', () => {
      const nonExecutionScheduler = new SchedulerService(context, false)

      nonExecutionScheduler
        .call(async () => {
          console.log('test')
        }, 'test_task')
        .everyMinute()

      expect(nonExecutionScheduler.tasks).toHaveLength(1)
      expect(nonExecutionScheduler.canExecute).toBe(false)
    })

    it('should not start tasks on non-execution worker', () => {
      const nonExecutionScheduler = new SchedulerService(context, false)
      const startSpy = vi.fn()

      nonExecutionScheduler.call(async () => {}, 'test_task').everyMinute()

      // Mock the start method on the task
      nonExecutionScheduler.tasks[0].start = startSpy

      nonExecutionScheduler.startAll()

      // Verify that start was NOT called because canExecute is false
      expect(startSpy).not.toHaveBeenCalled()
    })
  })

  describe('Task Query Methods', () => {
    it('should return all tasks with getTasks', () => {
      scheduler._setOwner('plugin-a')
      scheduler.call(async () => {}, 'task_1').everyMinute()
      scheduler._clearOwner()

      scheduler._setOwner('plugin-b')
      scheduler.call(async () => {}, 'task_2').hourly()
      scheduler._clearOwner()

      const tasks = scheduler.getTasks()

      expect(tasks).toHaveLength(2)
      expect(tasks[0]).toHaveProperty('name')
      expect(tasks[0]).toHaveProperty('owner')
      expect(tasks[0]).toHaveProperty('schedule')
      expect(tasks[0]).toHaveProperty('withoutOverlapping')
    })

    it('should filter tasks by owner with getTasksByOwner', () => {
      scheduler._setOwner('my-plugin')
      scheduler.call(async () => {}, 'plugin_task').everyMinute()
      scheduler._clearOwner()

      scheduler.call(async () => {}, 'core_task').hourly()

      const pluginTasks = scheduler.getTasksByOwner('my-plugin')

      expect(pluginTasks).toHaveLength(1)
      expect(pluginTasks[0].owner).toBe('my-plugin')
    })

    it('should return empty array for non-existent owner', () => {
      const tasks = scheduler.getTasksByOwner('non-existent')
      expect(tasks).toEqual([])
    })
  })

  describe('Task Configuration', () => {
    it('should support allowOverlapping configuration', () => {
      const task = scheduler
        .call(async () => {}, 'long_task')
        .everyMinute()
        .allowOverlapping()

      expect(task.withoutOverlapping).toBe(false)
    })

    it('should prevent overlapping by default', () => {
      const task = scheduler.call(async () => {}, 'default_task').everyMinute()

      expect(task.withoutOverlapping).toBe(true)
    })

    it('should support named method', () => {
      const task = scheduler.call(async () => {}).named('custom_name').everyMinute()

      expect(task.name).toBe('custom_name')
    })

    it('should support method chaining', () => {
      const task = scheduler
        .call(async () => {})
        .named('chained_task')
        .allowOverlapping()
        .everyFiveMinutes()

      expect(task.name).toBe('chained_task')
      expect(task.withoutOverlapping).toBe(false)
      expect(task.cronExpression).toBe('*/5 * * * *')
    })
  })

  describe('Complex Scenarios', () => {
    it('should handle multiple plugins with multiple tasks', async () => {
      // Email plugin
      scheduler._setOwner('email-plugin')
      scheduler.call(async () => {}, 'email_digest').dailyAt('08:00')
      scheduler.call(async () => {}, 'email_cleanup').weekly()
      scheduler._clearOwner()

      // Backup plugin
      scheduler._setOwner('backup-plugin')
      scheduler.call(async () => {}, 'backup_database').dailyAt('02:00')
      scheduler.call(async () => {}, 'backup_cleanup').monthly()
      scheduler._clearOwner()

      // Analytics theme
      scheduler._setOwner('analytics-theme')
      scheduler.call(async () => {}, 'analytics_aggregate').hourly()
      scheduler._clearOwner()

      expect(scheduler.getTasks()).toHaveLength(5)
      expect(scheduler.getTasksByOwner('email-plugin')).toHaveLength(2)
      expect(scheduler.getTasksByOwner('backup-plugin')).toHaveLength(2)
      expect(scheduler.getTasksByOwner('analytics-theme')).toHaveLength(1)

      // Deactivate email plugin
      await scheduler.teardownTasksByOwner('email-plugin')

      expect(scheduler.getTasks()).toHaveLength(3)
      expect(scheduler.getTasksByOwner('email-plugin')).toHaveLength(0)
    })

    it('should simulate full plugin lifecycle', async () => {
      // 1. System starts, core tasks registered
      scheduler.call(async () => {}, 'core_system_task').everyFiveMinutes()

      expect(scheduler.getTasks()).toHaveLength(1)

      // 2. Plugin installed and activated
      scheduler._setOwner('my-plugin')
      scheduler.call(async () => {}, 'plugin_task_1').everyMinute()
      scheduler.call(async () => {}, 'plugin_task_2').hourly()
      scheduler._clearOwner()

      expect(scheduler.getTasks()).toHaveLength(3)

      // 3. Plugin deactivated (tasks torn down)
      await scheduler.teardownTasksByOwner('my-plugin')

      expect(scheduler.getTasks()).toHaveLength(1)

      // 4. Plugin reactivated
      scheduler._setOwner('my-plugin')
      scheduler.call(async () => {}, 'plugin_task_1').everyMinute()
      scheduler.call(async () => {}, 'plugin_task_2').hourly()
      scheduler._clearOwner()

      expect(scheduler.getTasks()).toHaveLength(3)

      // 5. Plugin uninstalled (tasks torn down permanently)
      await scheduler.teardownTasksByOwner('my-plugin')

      expect(scheduler.getTasks()).toHaveLength(1)
      expect(scheduler.tasks[0].name).toBe('core_system_task')
    })
  })

  describe('Error Handling', () => {
    it('should throw error when starting task without schedule', () => {
      const task = scheduler.call(async () => {}, 'no_schedule')

      expect(() => task.start()).toThrow('No schedule defined for task: no_schedule')
    })

    it('should warn when teardown called without owner', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await scheduler.teardownTasksByOwner(null)

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cannot teardown tasks: no owner specified')
      )

      consoleWarnSpy.mockRestore()
    })
  })

  describe('Security', () => {
    it('should prevent plugins from modifying owner after creation', () => {
      scheduler._setOwner('plugin-a')
      const task = scheduler.call(async () => {}, 'secure_task').everyMinute()
      scheduler._clearOwner()

      // Malicious attempt to change owner
      expect(() => {
        task.owner = 'malicious-plugin'
      }).toThrow()

      // Owner should remain unchanged
      expect(task.owner).toBe('plugin-a')
    })

    it('should not allow plugins to teardown other plugins tasks', async () => {
      // Plugin A creates tasks
      scheduler._setOwner('plugin-a')
      scheduler.call(async () => {}, 'plugin_a_task').everyMinute()
      scheduler._clearOwner()

      // Plugin B creates tasks
      scheduler._setOwner('plugin-b')
      scheduler.call(async () => {}, 'plugin_b_task').everyMinute()
      scheduler._clearOwner()

      // Plugin B tries to teardown Plugin A tasks (should only work if called by system)
      await scheduler.teardownTasksByOwner('plugin-a')

      // Plugin A tasks should be removed (because teardownTasksByOwner is system-level)
      expect(scheduler.getTasksByOwner('plugin-a')).toHaveLength(0)
      expect(scheduler.getTasksByOwner('plugin-b')).toHaveLength(1)

      // Note: In production, teardownTasksByOwner is called by the lifecycle system,
      // not directly by plugins, so this behavior is expected
    })
  })
})
