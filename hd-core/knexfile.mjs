import path from 'path'
import { fileURLToPath } from 'url'
import 'dotenv/config'

// Get the absolute path to the directory of this file
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

if (!process.env.TABLE_PREFIX) {
  process.env.TABLE_PREFIX = 'hd_'
}

export default {
  development: {
    client: 'better-sqlite3',
    connection: {
      // Path to the database file relative to the project root
      filename: path.resolve(__dirname, '..', 'hd-content', 'config', 'htmldrop.db')
    },
    useNullAsDefault: true,
    migrations: {
      // Path to the migrations folder relative to this knexfile
      directory: path.join(__dirname, 'database/migrations'),
      loadExtensions: ['.mjs'],
      tableName: `${process.env.TABLE_PREFIX  }migrations`,
      lockTableName: `${process.env.TABLE_PREFIX  }migrations_lock`
    },
    seeds: {
      directory: path.join(__dirname, 'database/seeds'),
      loadExtensions: ['.mjs']
    }
  }
}
