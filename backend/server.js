import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import mainPool, {
  createDatabase,
  databaseExists,
  listDatabases,
  initDatabase,
  exportDatabase,
  migrateDatabase,
  getPoolForDatabase
} from './db.js'
import {
  logDatabaseCreation,
  logDatabaseAccess,
  logDatabaseMigration,
  logUserOperation,
  readLogs
} from './logger.js'
import { DEFAULT_API_KEY } from './auth.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`)
  next()
})

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    apiKey: DEFAULT_API_KEY
  })
})

app.get('/api/databases', async (req, res) => {
  try {
    const databases = await listDatabases()
    logDatabaseAccess('all', req.userId || 'anonymous', true)
    res.json(databases)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/databases', async (req, res) => {
  try {
    const { name } = req.body
    if (!name) return res.status(400).json({ error: 'Schema name is required' })

    const result = await createDatabase(name)
    await initDatabase(name)
    logDatabaseCreation(name, req.userId || 'anonymous', true)

    res.status(201).json({ ...result, database: name })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

app.get('/api/databases/:name/exists', async (req, res) => {
  const exists = await databaseExists(req.params.name)
  res.json({ database: req.params.name, exists })
})

app.post('/api/databases/:name/initialize', async (req, res) => {
  const { name } = req.params
  if (!(await databaseExists(name))) {
    return res.status(404).json({ error: 'Schema not found' })
  }
  const result = await initDatabase(name)
  res.json(result)
})

app.get('/api/databases/:name/export', async (req, res) => {
  const { name } = req.params
  if (!(await databaseExists(name))) {
    return res.status(404).json({ error: 'Schema not found' })
  }
  res.json(await exportDatabase(name))
})

app.post('/api/databases/migrate', async (req, res) => {
  const { sourceDatabase, targetDatabase } = req.body
  if (!sourceDatabase || !targetDatabase) {
    return res.status(400).json({ error: 'Source and target required' })
  }

  if (!(await databaseExists(sourceDatabase))) {
    return res.status(404).json({ error: 'Source schema not found' })
  }

  if (!(await databaseExists(targetDatabase))) {
    return res.status(404).json({ error: 'Target schema not found' })
  }

  const result = await migrateDatabase(sourceDatabase, targetDatabase)
  logDatabaseMigration(sourceDatabase, targetDatabase, req.userId || 'anonymous', true, result)
  res.json(result)
})

app.get('/api/logs', (req, res) => {
  const limit = Number(req.query.limit) || 100
  const logs = readLogs(limit)
  res.json({ logs, count: logs.length })
})

app.get('/api/databases/:dbName/users', async (req, res) => {
  const { dbName } = req.params
  if (!(await databaseExists(dbName))) {
    return res.status(404).json({ error: 'Schema not found' })
  }

  const pool = getPoolForDatabase(dbName)
  const result = await pool.query(`SELECT * FROM "${dbName}".users`)
  res.json(result.rows)
})

app.post('/api/databases/:dbName/users', async (req, res) => {
  const { dbName } = req.params
  const { name, email, age } = req.body

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email required' })
  }

  const pool = getPoolForDatabase(dbName)
  const result = await pool.query(
    `INSERT INTO "${dbName}".users (name, email, age)
     VALUES ($1, $2, $3) RETURNING *`,
    [name, email, age || null]
  )

  logUserOperation('create', { database: dbName, userId: result.rows[0].id, email }, req.userId || 'anonymous')
  res.status(201).json(result.rows[0])
})

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' })
})

app.use((err, req, res, next) => {
  res.status(500).json({
    error: 'Something went wrong!',
    message: err.message
  })
})

if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
  })
}

export default app
