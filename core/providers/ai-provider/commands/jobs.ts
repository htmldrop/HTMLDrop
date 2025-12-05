import type { AICommand, AICommandResult } from '../../../registries/RegisterAICommands.ts'

type RegisterFn = (command: AICommand, priority?: number) => void

export default function registerJobCommands(register: RegisterFn, context: HTMLDrop.Context): void {
  const { knex, table } = context

  register({
    slug: 'jobs.list',
    name: 'List Jobs',
    description: 'List background jobs with optional filtering',
    category: 'jobs',
    type: 'read',
    permission: 'auto',
    capabilities: ['read_jobs', 'manage_jobs'],
    parameters: [
      { name: 'status', type: 'string', required: false, description: 'Filter by status', enum: ['pending', 'running', 'completed', 'failed', 'cancelled'] },
      { name: 'type', type: 'string', required: false, description: 'Filter by job type' },
      { name: 'limit', type: 'number', required: false, description: 'Number of jobs to return (default: 20)' }
    ],
    execute: async (params): Promise<AICommandResult> => {
      const { status, type, limit = 20 } = params as { status?: string; type?: string; limit?: number }

      if (!knex) {
        return { success: false, message: 'Database not available', error: 'NO_DATABASE' }
      }

      let query = knex(table('posts'))
        .where('post_type_slug', 'jobs')
        .orderBy('created_at', 'desc')
        .limit(limit)
        .select('id', 'title', 'status', 'created_at', 'updated_at')

      if (status) {
        query = query.where('status', status)
      }

      const jobs = await query

      // Get job metadata
      const jobsWithMeta = await Promise.all(
        jobs.map(async (job: { id: number; title: string; status: string; created_at: Date; updated_at: Date }) => {
          const meta = await knex(table('post_meta'))
            .where('post_id', job.id)
            .select('field_slug', 'value')

          const metadata: Record<string, unknown> = {}
          for (const m of meta) {
            try {
              metadata[m.field_slug] = JSON.parse(m.value)
            } catch {
              metadata[m.field_slug] = m.value
            }
          }

          // Filter by type if specified
          if (type && metadata.type !== type) {
            return null
          }

          return {
            ...job,
            type: metadata.type || 'unknown',
            progress: metadata.progress || 0,
            result: metadata.result,
            error: metadata.error
          }
        })
      )

      const filteredJobs = jobsWithMeta.filter(Boolean)

      return {
        success: true,
        message: `Found ${filteredJobs.length} jobs`,
        data: { jobs: filteredJobs }
      }
    }
  })

  register({
    slug: 'jobs.get',
    name: 'Get Job Details',
    description: 'Get detailed information about a specific job',
    category: 'jobs',
    type: 'read',
    permission: 'auto',
    capabilities: ['read_jobs', 'manage_jobs'],
    parameters: [
      { name: 'id', type: 'number', required: true, description: 'Job ID' }
    ],
    execute: async (params): Promise<AICommandResult> => {
      const { id } = params as { id: number }

      if (!knex) {
        return { success: false, message: 'Database not available', error: 'NO_DATABASE' }
      }

      const job = await knex(table('posts'))
        .where('post_type_slug', 'jobs')
        .where('id', id)
        .first()

      if (!job) {
        return { success: false, message: `Job not found: ${id}`, error: 'NOT_FOUND' }
      }

      // Get all metadata
      const meta = await knex(table('post_meta'))
        .where('post_id', job.id)
        .select('field_slug', 'value')

      const metadata: Record<string, unknown> = {}
      for (const m of meta) {
        try {
          metadata[m.field_slug] = JSON.parse(m.value)
        } catch {
          metadata[m.field_slug] = m.value
        }
      }

      return {
        success: true,
        message: `Job details for ID ${id}`,
        data: {
          id: job.id,
          title: job.title,
          status: job.status,
          created_at: job.created_at,
          updated_at: job.updated_at,
          ...metadata
        }
      }
    }
  })

  register({
    slug: 'jobs.cleanup',
    name: 'Cleanup Old Jobs',
    description: 'Delete old completed and failed jobs',
    category: 'jobs',
    type: 'write',
    permission: 'require_approval',
    capabilities: ['delete_jobs', 'manage_jobs'],
    parameters: [
      { name: 'daysOld', type: 'number', required: false, description: 'Delete jobs older than this many days (default: 30)' }
    ],
    execute: async (params): Promise<AICommandResult> => {
      const { daysOld = 30 } = params as { daysOld?: number }

      if (!knex) {
        return { success: false, message: 'Database not available', error: 'NO_DATABASE' }
      }

      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - daysOld)

      // Get jobs to delete
      const jobsToDelete = await knex(table('posts'))
        .where('post_type_slug', 'jobs')
        .whereIn('status', ['completed', 'failed', 'cancelled'])
        .where('created_at', '<', cutoffDate)
        .select('id')

      if (jobsToDelete.length === 0) {
        return {
          success: true,
          message: `No jobs older than ${daysOld} days to delete`
        }
      }

      const jobIds = jobsToDelete.map((j: { id: number }) => j.id)

      // Delete metadata first
      await knex(table('post_meta')).whereIn('post_id', jobIds).del()

      // Delete jobs
      await knex(table('posts')).whereIn('id', jobIds).del()

      return {
        success: true,
        message: `Deleted ${jobIds.length} jobs older than ${daysOld} days`,
        data: { deletedCount: jobIds.length }
      }
    }
  })

  register({
    slug: 'jobs.cancel',
    name: 'Cancel Job',
    description: 'Cancel a pending or running job',
    category: 'jobs',
    type: 'write',
    permission: 'require_approval',
    capabilities: ['manage_jobs'],
    parameters: [
      { name: 'id', type: 'number', required: true, description: 'Job ID to cancel' }
    ],
    execute: async (params): Promise<AICommandResult> => {
      const { id } = params as { id: number }

      if (!knex) {
        return { success: false, message: 'Database not available', error: 'NO_DATABASE' }
      }

      const job = await knex(table('posts'))
        .where('post_type_slug', 'jobs')
        .where('id', id)
        .first()

      if (!job) {
        return { success: false, message: `Job not found: ${id}`, error: 'NOT_FOUND' }
      }

      if (job.status !== 'pending' && job.status !== 'running') {
        return {
          success: false,
          message: `Cannot cancel job with status: ${job.status}`,
          error: 'INVALID_STATUS'
        }
      }

      await knex(table('posts'))
        .where('id', id)
        .update({
          status: 'cancelled',
          updated_at: knex.fn.now()
        })

      return {
        success: true,
        message: `Job ${id} has been cancelled`
      }
    }
  })

  register({
    slug: 'jobs.stats',
    name: 'Get Job Statistics',
    description: 'Get statistics about background jobs',
    category: 'jobs',
    type: 'read',
    permission: 'auto',
    capabilities: ['read_jobs', 'manage_jobs'],
    parameters: [],
    execute: async (): Promise<AICommandResult> => {
      if (!knex) {
        return { success: false, message: 'Database not available', error: 'NO_DATABASE' }
      }

      const stats = await knex(table('posts'))
        .where('post_type_slug', 'jobs')
        .select('status')
        .count('id as count')
        .groupBy('status')

      const byStatus: Record<string, number> = {}
      let total = 0

      for (const stat of stats) {
        byStatus[stat.status] = stat.count as number
        total += stat.count as number
      }

      // Get recent jobs count (last 24 hours)
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)

      const recentResult = await knex(table('posts'))
        .where('post_type_slug', 'jobs')
        .where('created_at', '>', yesterday)
        .count('id as count')
        .first()

      return {
        success: true,
        message: 'Job statistics',
        data: {
          total,
          byStatus,
          last24Hours: recentResult?.count || 0
        }
      }
    }
  })
}
