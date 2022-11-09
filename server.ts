import path from 'path'

import express from 'express'
import morgan from 'morgan'
import glob from 'glob'

const PORT = 3000

const main = async () => {
  const app = express()

  // log middleware
  // skipping /healthz because docker health checks it every second or so
  app.use(
    morgan('tiny', {
      skip: (req) => req.url === '/healthz'
    })
  )

  // * Same settings as in Watchtower
  app.use(
    express.json({
      limit: '6MB',
      verify: (req, _res, buf) => {
        // adding the raw body to the reqest object so it can be used for
        // signature verification(e.g.Stripe Webhooks)
        req.rawBody = buf.toString()
      }
    })
  )
  app.use(express.urlencoded({ extended: true }))
  app.disable('x-powered-by')

  app.get('/healthz', (_req, res) => {
    res.status(200).send('ok')
  })

  const functionsPath = path.join(process.cwd(), process.env.FUNCTIONS_RELATIVE_PATH)
  const files = glob.sync('**/*.@(js|ts)', {
    cwd: functionsPath,
    ignore: [
      '**/node_modules/**', // ignore node_modules directories
      '**/_**/*', // ignore files inside directories that start with _
      '**/_*' // ignore files that start with _
    ]
  })

  for (const file of files) {
    const { default: handler } = await import(path.join(functionsPath, file))

    // File path relative to the project root directory. Used for logging.
    const relativePath = path.relative(process.env.NHOST_PROJECT_PATH, file)

    if (handler) {
      const route = `/${file}`.replace(/(\.ts|\.js)$/, '').replace(/\/index$/, '/')

      try {
        app.all(route, handler)
      } catch (error) {
        console.warn(`Unable to load file ${relativePath} as a Serverless Function`)
        continue
      }

      console.log(`Loaded route ${route} from ${relativePath}`)
    } else {
      console.warn(`No default export at ${relativePath}`)
    }
  }

  app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`)
  })
}

main()
