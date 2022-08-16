import path from 'path'

import express from 'express'
import glob from 'glob'

const {
  performance
} = require('node:perf_hooks')

const PORT = 3000

const main = async () => {
  const app = express()

  // * Same settings as in Watchtower
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))
  app.disable('x-powered-by')

  app.get('/healthz', (_req: express.Request, res: express.Response) => {
    res.status(200).send('ok')
  })

  app.use('/', (req, res, next) => {
    const requestStart = performance.now()
    const requestUrl = `${req.method} ${req.originalUrl}`

    console.log(requestUrl)
    res.on('finish', () => {
      console.log(`Processed ${requestUrl} in ${performance.now() - requestStart} ms, response code: ${res.statusCode}\n`)
    })

    next()
  })

  const functionsPath = path.join(process.cwd(), 'functions')
  const files = glob.sync('**/*.@(js|ts)', { cwd: functionsPath })

  for (const file of files) {
    const { default: handler } = await import(path.join(functionsPath, file))
    if (handler) {
      const route = `/${file}`
        .replace(/(\.ts|\.js)$/, '')
        .replace(/\/index$/, '/')
      app.all(route, handler)
      console.log(`Loaded route ${route} from ./functions/${file}`)
    } else {
      console.warn(`No default export in ./functions/${file}`)
    }
  }

  app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`)
  })
}

main()
