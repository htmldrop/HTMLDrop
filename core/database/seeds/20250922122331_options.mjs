export const seed = async (knex) => {
  const prefix = process.env.TABLE_PREFIX
  const tableName = `${prefix  }options`
  const seeds = [
    { name: 'theme', value: '', autoload: true },
    {
      name: 'active_plugins',
      value: JSON.stringify(['coralpen']),
      autoload: true
    },
    {
      name: 'allow_registrations',
      value: process.env.ALLOW_REGISTRATIONS || 'false',
      autoload: true
    },
    {
      name: 'tracing',
      value: JSON.stringify({
        enabled: process.env.HD_TRACING_ENABLED !== 'false',
        persist: process.env.HD_TRACING_PERSIST === 'true',
        sampleRate: parseFloat(process.env.HD_TRACING_SAMPLE_RATE) || 1.0,
        verbose: process.env.HD_TRACING_VERBOSE === 'true',
        maxTraces: parseInt(process.env.HD_TRACING_MAX_TRACES) || 100,
        maxAgeMs: parseInt(process.env.HD_TRACING_MAX_AGE_MS) || 3600000,
        retentionDays: parseInt(process.env.HD_TRACING_RETENTION_DAYS) || 30,
        archiveAfterDays: parseInt(process.env.HD_TRACING_ARCHIVE_AFTER_DAYS) || 7,
        archivePath: process.env.HD_TRACING_ARCHIVE_PATH || './content/traces',
        cleanupIntervalMs: parseInt(process.env.HD_TRACING_CLEANUP_INTERVAL_MS) || 3600000
      }),
      autoload: true
    }
  ]

  for (const seed of seeds) {
    const record = await knex(tableName).where({ name: seed.name }).first()
    if (!record) {
      await knex(tableName).insert({ ...seed, created_at: knex.fn.now(), updated_at: knex.fn.now() })
    }
  }
}
