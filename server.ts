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
      skip: req => req.url === '/healthz'
    })
  )

  // * Same settings as in Watchtower
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))
  app.disable('x-powered-by')

  app.get('/healthz', (_req, res) => {
    res.status(200).send('ok')
  })

  const functionsPath = path.join(
    process.cwd(),
    process.env.FUNCTIONS_RELATIVE_PATH
  )
  const files = glob.sync('**/*.@(js|ts)', { cwd: functionsPath })

  for (const file of files) {
    const { default: handler } = await import(path.join(functionsPath, file))

    // ignore files inside directories that starts with _
    const isIgnoredFile = file.startsWith('_') || file.indexOf('/_') !== -1

    if (handler && !isIgnoredFile) {
      const route = `/${file}`
        .replace(/(\.ts|\.js)$/, '')
        .replace(/\/index$/, '/')

      try {
        app.all(route, handler)
      } catch (error) {
        console.warn(
          `Unable to load file ./functions/${file} as a Serverless Function`
        )
        continue
      }

      console.log(`Loaded route ${route} from ./functions/${file}`)
    } else {
      console.warn(
        `No default export or file is ignored at ./functions/${file}`
      )
    }
  }

  app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`)
  })
}

main()
