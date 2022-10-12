import path from 'path'
import { watch } from 'chokidar'
import express, { RequestHandler } from 'express'
import morgan from 'morgan'
import dotenv from 'dotenv'

console.log('Starting server...')

const PORT = 3000

// * Initial environment values before loading anything from .env files
const INITIAL_ENV = { ...process.env }

const FUNCTIONS_FULL_PATH = path.join(
  process.cwd(),
  process.env.FUNCTIONS_RELATIVE_PATH
)

// * Possible .env files that will be watched and loaded, by order of preference
const DOT_FILES = ['.env.development', '.env']

// * Get the http route corresponding to a file
const getRoutePath = (file: string) =>
  `/${file}`.replace(/(\.ts|\.js)$/, '').replace(/\/index$/, '/')

// * Module factory: key is the file, value is the imported module
const modulesFactory: Record<string, RequestHandler> = {}

// * Load or reload a module into the factory
const loadModule = (file: string) => {
  const route = getRoutePath(file)
  const filePath = path.join(FUNCTIONS_FULL_PATH, file)
  let verb = `Loaded`
  if (modulesFactory[file]) {
    verb = 'Reloaded'
    delete require.cache[require.resolve(filePath)]
  }
  const { default: handler } = require(filePath)
  modulesFactory[file] = handler
  console.log(`${verb} ${file} to ${route}`)
  return route
}

// * Load or reload the first .env file from the DOT_FILES list, and reload the modules if needed.
const loadDotEnv = () => {
  process.env = {}
  Object.assign(process.env, INITIAL_ENV)
  let shouldReloadModules = false
  for (const dotFile of DOT_FILES) {
    const result = dotenv.config({
      path: path.join(process.env.NHOST_PROJECT_PATH, dotFile)
    })
    if (!result.error) {
      shouldReloadModules = true
      console.log(`Loaded environment variables from ${dotFile} `)
      break
    }
  }
  if (shouldReloadModules) {
    for (const file of Object.keys(modulesFactory)) {
      loadModule(file)
    }
  }
}

const app = express()

// log middleware
app.use(
  morgan('tiny', {
    // skipping /healthz because docker health checks it every second or so
    skip: req => req.url === '/healthz'
  })
)

// * Same settings as in Watchtower
app.use(express.json({ limit: '6MB' }))
app.use(express.urlencoded({ extended: true }))
app.disable('x-powered-by')

app.get('/healthz', (_req, res) => {
  res.status(200).send('ok')
})

// * Watches and loads .env files into process.env and re-imports all modules when needed
watch(DOT_FILES, {
  cwd: process.env.NHOST_PROJECT_PATH,
  persistent: false
}).on('all', loadDotEnv)
// // * Watches and loads user handlers
watch('**/*.@(js|ts)', {
  cwd: FUNCTIONS_FULL_PATH,
  // persistent: false,
  ignored: [
    '**/node_modules/**', // ignore node_modules directories
    '**/_**/*', // ignore files inside directories that start with _
    '**/_*' // ignore files that start with _
  ]
})
  .on('add', file => {
    const route = loadModule(file)

    app.all(route, (req, res, next) => {
      const mw = modulesFactory[file]
      if (!mw) {
        return res.status(404).send('Not found')
      }
      try {
        mw(req, res, next)
      } catch (error) {
        console.warn(`Unable to run handler for ${route}: ${error.message}`)
        res.status(500).send('Internal Server Error')
      }
    })
  })
  .on('change', loadModule)
  .on('unlink', file => {
    const route = getRoutePath(file)
    delete modulesFactory[file]
    console.log(`Removed ${file}. Deactivating route ${route}`)
  })

const server = app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`)
})

process.on('SIGTERM', () => {
  console.log('SIGTERM in CHILD')
  server.close()
  process.exit(0)
})
