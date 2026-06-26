import { execSync, spawn } from 'child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import path from 'path'
import { getProjectsDir, getPythonCommand, getVenvPython, getVenvActivate, quoteForShell, isWindows, isLinux } from './platform'
import { ServiceManager } from './service-manager'
import { ensurePostgreSQL, isPostgreSQLInstalled } from './postgres'

export interface DetectedOdoo {
  version: string
  path: string
  hasConfig: boolean
  hasOdooBin: boolean
  hasVenv: boolean
  hasService: boolean
  status: 'complete' | 'partial' | 'cloned'
  pythonVersion: string
  port: number | null
}

export function detectAllOdoo(): DetectedOdoo[] {
  const results: DetectedOdoo[] = []
  const scanned = new Set<string>()

  const addIfNew = (odoopath: string) => {
    const abs = path.resolve(odoopath)
    if (scanned.has(abs)) return
    scanned.add(abs)
    results.push(scanOdooDir(abs))
  }

  // 1. Scan projects directory
  const projectsDir = getProjectsDir()
  if (existsSync(projectsDir)) {
    try {
      const entries = readdirSync(projectsDir)
      for (const entry of entries) {
        if (entry.startsWith('odoo')) {
          addIfNew(path.join(projectsDir, entry))
        }
      }
    } catch {}
  }

  // 2. Scan common locations on Linux
  if (isLinux()) {
    const linuxPaths = [
      '/usr/lib/python3/dist-packages/odoo',
      '/usr/lib/python3.10/dist-packages/odoo',
      '/usr/lib/python3.11/dist-packages/odoo',
      '/usr/lib/python3.12/dist-packages/odoo',
      '/opt/odoo',
      '/srv/odoo',
    ]
    for (const p of linuxPaths) {
      if (existsSync(p)) addIfNew(p)
    }
  }

  // 3. Scan PATH for odoo-bin
  try {
    const pathEnv = (process.env.PATH || '').split(path.delimiter)
    for (const dir of pathEnv) {
      if (!dir) continue
      const odooBin = path.join(dir, 'odoo-bin')
      const odooBinExe = path.join(dir, 'odoo-bin.exe')
      if (existsSync(odooBin)) {
        addIfNew(path.dirname(odooBin))
      }
      if (existsSync(odooBinExe)) {
        addIfNew(path.dirname(odooBinExe))
      }
    }
  } catch {}

  // 4. On Windows, check Program Files
  if (isWindows()) {
    const winPaths = [
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Odoo'),
      path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Odoo'),
      path.join(process.env.LOCALAPPDATA || '', 'Odoo'),
      path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Odoo'),
    ]
    for (const p of winPaths) {
      if (existsSync(p)) addIfNew(p)
    }
  }

  return results
}

function scanOdooDir(dir: string): DetectedOdoo {
  const odooBin = path.join(dir, 'odoo-bin')
  const configFile = path.join(dir, 'odoo.conf')
  const venvDir = path.join(dir, 'venv')
  const releasePy = path.join(dir, 'odoo', 'release.py')
  const releasePyAlt = path.join(dir, 'release.py')

  const hasOdooBin = existsSync(odooBin)
  const hasConfig = existsSync(configFile)
  const hasVenv = existsSync(path.join(venvDir, isWindows() ? 'Scripts' : 'bin', isWindows() ? 'python.exe' : 'python'))

  let version = 'unknown'
  let port: number | null = null
  let pythonVersion = '3.10'

  // Try to detect version from release.py
  try {
    if (existsSync(releasePy)) {
      const raw = readFileSync(releasePy, 'utf8')
      const m = raw.match(/version_info\s*=\s*\((\d+),\s*(\d+)/)
      if (m) version = `${m[1]}.${m[2]}`
    } else if (existsSync(releasePyAlt)) {
      const raw = readFileSync(releasePyAlt, 'utf8')
      const m = raw.match(/version_info\s*=\s*\((\d+),\s*(\d+)/)
      if (m) version = `${m[1]}.${m[2]}`
    }
  } catch {}

  // Fallback: guess version from directory name
  if (version === 'unknown') {
    const dirName = path.basename(dir).replace('odoo', '')
    if (dirName === '18' || dirName === '') version = '18.0'
    else if (dirName === '17') version = '17.0'
    else if (dirName === '16') version = '16.0'
    else if (dirName === '15') version = '15.0'
  }

  // Try to get port from config
  if (hasConfig) {
    try {
      const raw = readFileSync(configFile, 'utf8')
      const m = raw.match(/^http_port\s*=\s*(\d+)$/m)
      if (m) port = parseInt(m[1])
    } catch {}
  }

  // Determine python version
  const v = parseFloat(version)
  if (v >= 18) pythonVersion = '3.12'
  else if (v >= 17) pythonVersion = '3.11'
  else if (v >= 16) pythonVersion = '3.10'
  else if (v >= 15) pythonVersion = '3.9'

  // Determine status
  let status: 'complete' | 'partial' | 'cloned' = 'cloned'
  if (hasOdooBin && hasConfig && hasVenv) {
    status = 'complete'
  } else if (hasOdooBin || hasConfig) {
    status = 'partial'
  }

  // Check service (Linux only)
  let hasService = false
  if (isLinux()) {
    try {
      const serviceName = path.basename(dir)
      const out = execSync(`systemctl is-active ${serviceName} 2>/dev/null`, { encoding: 'utf8', timeout: 2000 })
      hasService = out.trim() === 'active'
    } catch {}
  }

  return { version, path: dir, hasConfig, hasOdooBin, hasVenv, hasService, status, pythonVersion, port }
}

export function setupInstance(instancePath: string): { success: boolean; message: string } {
  try {
    const dir = instancePath
    const odooBin = path.join(dir, 'odoo-bin')
    const configFile = path.join(dir, 'odoo.conf')
    const venvDir = path.join(dir, 'venv')
    const reqFile = path.join(dir, 'requirements.txt')

    if (!existsSync(odooBin)) {
      return { success: false, message: 'odoo-bin not found. The clone may be incomplete.' }
    }

    // Ensure PostgreSQL is available
    const pgReq = ensurePostgreSQL()
    if (!pgReq.success) return pgReq
    const pgHost = pgReq.host || '127.0.0.1'
    const pgPort = pgReq.port || 5432

    // Detect version for port and python
    let version = '17.0'
    try {
      const releasePy = path.join(dir, 'odoo', 'release.py')
      const releasePyAlt = path.join(dir, 'release.py')
      if (existsSync(releasePy)) {
        const raw = readFileSync(releasePy, 'utf8')
        const m = raw.match(/version_info\s*=\s*\((\d+),\s*(\d+)/)
        if (m) version = `${m[1]}.${m[2]}`
      } else if (existsSync(releasePyAlt)) {
        const raw = readFileSync(releasePyAlt, 'utf8')
        const m = raw.match(/version_info\s*=\s*\((\d+),\s*(\d+)/)
        if (m) version = `${m[1]}.${m[2]}`
      }
    } catch {}

    const dirName = path.basename(dir)
    const defaultPort = `80${version.split('.')[0]}`

    // Create config if missing
    if (!existsSync(configFile)) {
      const logDir = isLinux() ? '/var/log/odoo' : path.join(dir, 'log')
      if (!isLinux()) mkdirSync(logDir, { recursive: true })
      const logFile = path.join(logDir, `${dirName}-server.log`)
      const config = `[options]
addons_path = ${path.join(dir, 'addons')},${path.join(dir, 'odoo', 'addons')},${path.join(dir, 'sources')}
db_host = ${pgHost}
db_port = ${pgPort}
db_user = odoo
db_password = False
logfile = ${logFile}
admin_passwd = admin
http_port = ${defaultPort}
`
      mkdirSync(path.join(dir, 'sources'), { recursive: true })
      writeFileSync(configFile, config)
    }

    // Create venv if missing
    const pythonVer = getPythonCommand(version)
    const venvPython = getVenvPython(venvDir)
    if (!existsSync(venvPython)) {
      try {
        execSync(`${quoteForShell(pythonVer)} -m venv "${venvDir}"`, { timeout: 60000 })
      } catch {
        execSync(`${quoteForShell(pythonVer)} -m pip install virtualenv`, { timeout: 60000 })
        execSync(`${quoteForShell(pythonVer)} -m virtualenv "${venvDir}"`, { timeout: 120000 })
      }

      execSync(`${quoteForShell(venvPython)} -m pip install --upgrade pip wheel setuptools`, { timeout: 120000 })

      if (existsSync(reqFile)) {
        execSync(`${quoteForShell(venvPython)} -m pip install -r "${reqFile}"`, { timeout: 180000 })
      }
    }

    // Create sources dir
    mkdirSync(path.join(dir, 'sources'), { recursive: true })

    // Start Odoo
    const port = defaultPort
    const logFile = path.join(
      isLinux() ? '/var/log/odoo' : path.join(dir, 'log'),
      `${dirName}-server.log`
    )

    if (isWindows()) {
      const bootCode = `import sys;sys.path.insert(0,r'${dir.replace(/\\/g, '\\\\')}');import odoo.cli;odoo.cli.main()`
      const proc = spawn(venvPython, [
        '-c', bootCode,
        '--config', configFile,
        '--logfile', logFile,
      ], {
        cwd: dir,
        detached: true,
        stdio: 'ignore',
        shell: true,
      })
      proc.unref()
      ServiceManager.registerProcess(dirName, proc)
    } else {
      execSync(
        `nohup "${venvPython}" "${odooBin}" --config "${configFile}" --logfile "${logFile}" > /dev/null 2>&1 &`,
        { timeout: 5000 }
      )
    }

    return { success: true, message: `Odoo ${version} started on port ${port}` }
  } catch (e: any) {
    return { success: false, message: e.message || 'Error setting up instance' }
  }
}
