/**
 * Jobs Provider
 * Registers the jobs post type for background job tracking
 */

export default async function JobsProvider({ req }) {
  const { hooks } = req

  // Register jobs post type
  hooks.addAction('init', async () => {
    await hooks.registerPostType({
      name: 'Jobs',
      slug: 'jobs',
      description: 'Background jobs and task queue',
      icon: `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      `,
      public: false,
      show_in_menu: false,
      hierarchical: false,
      supports: ['title'],
      fields: [
        {
          name: 'Job ID',
          slug: 'job_id',
          type: 'text',
          description: 'Unique job identifier',
          required: true
        },
        {
          name: 'Description',
          slug: 'description',
          type: 'textarea',
          description: 'Job description'
        },
        {
          name: 'Type',
          slug: 'type',
          type: 'text',
          description: 'Job type (import, export, backup, etc.)',
          required: true
        },
        {
          name: 'Status',
          slug: 'status',
          type: 'select',
          description: 'Current job status',
          options: [
            { label: 'Pending', value: 'pending' },
            { label: 'Running', value: 'running' },
            { label: 'Completed', value: 'completed' },
            { label: 'Failed', value: 'failed' },
            { label: 'Cancelled', value: 'cancelled' }
          ],
          default: 'pending'
        },
        {
          name: 'Progress',
          slug: 'progress',
          type: 'number',
          description: 'Progress percentage (0-100)',
          default: 0,
          min: 0,
          max: 100
        },
        {
          name: 'Icon SVG',
          slug: 'icon_svg',
          type: 'textarea',
          description: 'Custom SVG icon for the job'
        },
        {
          name: 'Metadata',
          slug: 'metadata',
          type: 'json',
          description: 'Additional job metadata'
        },
        {
          name: 'Error Message',
          slug: 'error_message',
          type: 'textarea',
          description: 'Error message if job failed'
        },
        {
          name: 'Result',
          slug: 'result',
          type: 'json',
          description: 'Job result data'
        },
        {
          name: 'Source',
          slug: 'source',
          type: 'text',
          description: 'Source plugin/theme name',
          default: 'system'
        },
        {
          name: 'Started At',
          slug: 'started_at',
          type: 'datetime',
          description: 'When the job started'
        },
        {
          name: 'Completed At',
          slug: 'completed_at',
          type: 'datetime',
          description: 'When the job completed'
        }
      ]
    })
  })
}
