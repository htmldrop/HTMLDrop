import BadgeCountService from '../../services/BadgeCountService.mjs'

/**
 * Scheduler Provider
 *
 * Register scheduled tasks here. Tasks can also be registered by plugins/themes
 * using the scheduler instance from req.context.scheduler
 *
 * Note: All workers can register tasks, but only worker 1 will execute them.
 */

export default async ({ req, res, next }) => {
  const { scheduler } = req.context

  // Scheduler should always exist on all workers now
  if (!scheduler) {
    console.warn('[Scheduler] Scheduler not available in context')
    return
  }

  // Task: Refresh badge counts every 2 minutes
  scheduler
    .call(async () => {
      const badgeCountService = new BadgeCountService(req.context)
      await badgeCountService.updateBadgeCounts()
    }, 'refresh_badge_counts')
    .everyMinute()

  // Example: Daily cleanup task (commented out)
  // scheduler
  //   .call(async () => {
  //     console.log('Running daily cleanup...')
  //   }, 'daily_cleanup')
  //   .dailyAt('02:00')

  // Example: Weekly task (commented out)
  // scheduler
  //   .call(async () => {
  //     console.log('Running weekly maintenance...')
  //   }, 'weekly_maintenance')
  //   .weekly()

  // Start all scheduled tasks after all providers have registered their tasks
  // This is done via the 'init' action hook
  // Note: Only worker 1 will actually start the cron jobs
  req.hooks.addAction('init', () => {
    scheduler.startAll()
  }, 999) // Run at the end (high priority number)
}
