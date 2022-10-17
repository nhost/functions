import { watch } from 'chokidar'
import { spawn, spawnSync, ChildProcess } from 'child_process'
import { writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs'
import path from 'path'
import os from 'os'

let child: ChildProcess | null = null
let FUNCTIONS_ROOT_DIR = './functions'
let FUNCTIONS_RELATIVE_PATH = '.'

const { NODE_PATH, SERVER_PATH, PACKAGE_MANAGER } = process.env

const startServer = async () => {
  if (child) {
    await new Promise(resolve => {
      child.on('close', () => resolve(true))
      child.kill('SIGTERM')
    })
  }

  console.log('Installing dependencies...')
  spawnSync(`ni`, { cwd: FUNCTIONS_ROOT_DIR, stdio: 'inherit' })
  child = spawn(
    `node`,
    [
      '--no-warnings',
      '--loader',
      `${NODE_PATH}/tsx/dist/loader.js`,
      `${SERVER_PATH}/server.ts`
    ],
    {
      cwd: FUNCTIONS_ROOT_DIR,
      env: {
        ...process.env,
        FUNCTIONS_RELATIVE_PATH
      },
      stdio: ['ignore', process.stdout, process.stderr]
    }
  )
}

const main = async () => {
  writeFileSync(
    path.join(os.homedir(), '.nirc'),
    `defaultAgent=${PACKAGE_MANAGER}`,
    { encoding: 'utf8', flag: 'w' }
  )
  if (!existsSync(path.resolve('functions/package.json'))) {
    // * ./functions/package.json DOES NOT exist
    if (existsSync(path.resolve('./package.json'))) {
      FUNCTIONS_ROOT_DIR = '.'
      FUNCTIONS_RELATIVE_PATH = './functions'
    } else {
      // * ./package.json DOES NOT exist"
      const functionsAbsolutePath = path.resolve('functions')
      if (!existsSync(functionsAbsolutePath)) {
        mkdirSync(functionsAbsolutePath)
      }
      FUNCTIONS_ROOT_DIR = './functions'
      FUNCTIONS_RELATIVE_PATH = '.'
    }
  }

  if (!existsSync(path.join(FUNCTIONS_ROOT_DIR, 'package.json'))) {
    writeFileSync(
      path.join(FUNCTIONS_ROOT_DIR, 'package.json'),
      JSON.stringify({ name: 'nhost-functions', version: '0.0.1' }, null, 2),
      { encoding: 'utf8' }
    )
  }
  if (!existsSync(path.join(FUNCTIONS_ROOT_DIR, 'tsconfig.json'))) {
    writeFileSync(
      path.join(FUNCTIONS_ROOT_DIR, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            allowJs: true,
            skipLibCheck: true,
            noEmit: true,
            esModuleInterop: true,
            resolveJsonModule: true,
            isolatedModules: true,
            strictNullChecks: false
          }
        },
        null,
        2
      ),
      { encoding: 'utf8' }
    )
  }

  await startServer()
  watch(['package.json', 'tsconfig.json'], {
    cwd: FUNCTIONS_ROOT_DIR,
    ignoreInitial: true
  }).on('all', startServer)
}

main()
