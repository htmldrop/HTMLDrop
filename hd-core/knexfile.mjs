import path from 'path'
import { fileURLToPath } from 'url'
import 'dotenv/config'

// Get the absolute path to the directory of this file
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

if (!process.env.TABLE_PREFIX) {
  process.env.TABLE_PREFIX = 'hd_'
}

// Parse DB_CONNECTION if it exists
let connection
if (process.env.DB_CONNECTION) {
  try {
    connection = JSON.parse(process.env.DB_CONNECTION)
  } catch (e) {
    connection = process.env.DB_CONNECTION
  }
}

const baseConfig = {
  migrations: {
    directory: path.join(__dirname, 'database/migrations'),
    loadExtensions: ['.mjs'],
    tableName: `${process.env.TABLE_PREFIX}migrations`,
    lockTableName: `${process.env.TABLE_PREFIX}migrations_lock`
  },
  seeds: {
    directory: path.join(__dirname, 'database/seeds'),
    loadExtensions: ['.mjs']
  }
}

export default {
  development: {
    client: 'better-sqlite3',
    connection: {
      filename: path.resolve(__dirname, '..', 'hd-content', 'config', 'htmldrop.db')
    },
    useNullAsDefault: true,
    ...baseConfig
  },
  production: {
    client: process.env.DB_CLIENT || 'mysql2',
    connection: connection || {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    },
    useNullAsDefault: true,
    ...baseConfig
  }
}
