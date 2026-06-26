import { execSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import path from 'path'
import { isWindows, isLinux } from './platform'

export interface PGResult {
  success: boolean
  message: string
  host?: string
  port?: number
}

export interface PGStatus {
  installed: boolean
  version: string | null
  running: boolean
  path: string | null
  port: number | null
}

let pgCache: PGStatus | null = null

const PG_VERSIONS = ['17', '16', '15', '14', '13', '12']

interface PGInstall {
  dir: string
  version: string
  port: number
  dataDir: string
  binDir: string
  serviceName: string
}

function scanPGInstalls(): PGInstall[] {
  const installs: PGInstall[] = []
  const bases = [
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'PostgreSQL'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'PostgreSQL'),
  ].filter(Boolean) as string[]

  for (const base of bases) {
    if (!existsSync(base)) continue
    for (const ver of PG_VERSIONS) {
      const dir = path.join(base, ver)
      const binDir = path.join(dir, 'bin')
      if (!existsSync(path.join(binDir, 'pg_isready.exe'))) continue

      // Find data dir
      let dataDir = path.join(dir, 'data')
      if (!existsSync(path.join(dataDir, 'pg_hba.conf'))) {
        const alt = path.join(dir, '..', 'data')
        if (existsSync(path.join(alt, 'pg_hba.conf'))) dataDir = alt
      }

      // Find port from postgresql.conf
      let port = 5432
      const confPath = path.join(dataDir, 'postgresql.conf')
      if (existsSync(confPath)) {
        const conf = readFileSync(confPath, 'utf8')
        const m = conf.match(/^port\s*=\s*(\d+)/m)
        if (m) port = parseInt(m[1])
      }

      // Find service name
      let serviceName = `postgresql-x64-${ver}`
      try {
        const out = execSync(`sc query 2>nul | findstr /i "postgres"`, { encoding: 'utf8', timeout: 3000 })
        const lines = out.split('\n').filter(l => l.includes('postgres'))
        for (const line of lines) {
          const sm = line.match(/SERVICE_NAME:\s+(.+)/)
          if (sm && sm[1].includes(ver)) {
            serviceName = sm[1].trim()
            break
          }
        }
      } catch {}

      installs.push({ dir, version: ver, port, dataDir, binDir, serviceName })
    }
  }

  return installs
}

function testTrust(install: PGInstall): boolean {
  try {
    const out = execSync(
      `set PGPASSWORD=postgres && "${path.join(install.binDir, 'psql.exe')}" -h 127.0.0.1 -p ${install.port} -U postgres -w -c "SELECT 1" 2>nul`,
      { encoding: 'utf8', timeout: 5000 }
    )
    return out.includes('1')
  } catch {
    // Try without password (trust)
    try {
      const out = execSync(
        `"${path.join(install.binDir, 'psql.exe')}" -h 127.0.0.1 -p ${install.port} -U postgres -w -c "SELECT 1" 2>nul`,
        { encoding: 'utf8', timeout: 5000 }
      )
      return out.includes('1')
    } catch {
      return false
    }
  }
}

function configurePG(install: PGInstall): boolean {
  // Add trust for odoo user in pg_hba.conf
  const hbaPath = path.join(install.dataDir, 'pg_hba.conf')
  if (!existsSync(hbaPath)) return false

  let hba = readFileSync(hbaPath, 'utf8')
  if (!hba.includes('odoo')) {
    hba += `\nhost    all             odoo            127.0.0.1/32            trust\nhost    all             odoo            ::1/128                 trust\nlocal   all             odoo                                    trust\n`
    writeFileSync(hbaPath, hba, 'utf8')
  }

  // Try to reload config
  try {
    execSync(`"${path.join(install.binDir, 'pg_ctl.exe')}" reload -D "${install.dataDir}" 2>nul`, { timeout: 5000 })
  } catch {}

  // Create odoo user (trust works)
  try {
    execSync(
      `"${path.join(install.binDir, 'psql.exe')}" -h 127.0.0.1 -p ${install.port} -U postgres -w -c "CREATE ROLE odoo LOGIN SUPERUSER CREATEDB;" 2>nul`,
      { timeout: 5000 }
    )
  } catch {}

  return true
}

export function getPGStatus(): PGStatus {
  if (pgCache) return pgCache

  const result: PGStatus = {
    installed: false,
    version: null,
    running: false,
    path: null,
    port: null,
  }

  const installs = scanPGInstalls()
  if (installs.length > 0) {
    result.installed = true
    result.path = installs[0].dir
    result.version = installs[0].version
    result.port = installs[0].port
  }

  try {
    for (const inst of installs) {
      try {
        const out = execSync(
          `"${path.join(inst.binDir, 'pg_isready.exe')}" -p ${inst.port} 2>nul`,
          { encoding: 'utf8', timeout: 2000 }
        )
        if (out.includes('accepting')) {
          result.running = true
          result.port = inst.port
          result.version = inst.version
          result.path = inst.dir
          break
        }
      } catch {}
    }
  } catch {}

  if (result.running === false) {
    try {
      for (const inst of installs) {
        try {
          const out = execSync(`sc query "${inst.serviceName}" 2>nul | findstr "STATE"`, { encoding: 'utf8', timeout: 2000 })
          if (out.includes('RUNNING')) {
            result.running = true
            break
          }
        } catch {}
      }
    } catch {}
  }

  pgCache = result
  return result
}

export function resetPGCache(): void {
  pgCache = null
}

export function isPostgreSQLInstalled(): boolean {
  return getPGStatus().installed
}

export function ensurePostgreSQL(): PGResult {
  const status = getPGStatus()
  if (status.running) {
    const installs = scanPGInstalls()
    let configured = false
    for (const inst of installs) {
      if (testTrust(inst)) {
        try {
          execSync(
            `"${path.join(inst.binDir, 'psql.exe')}" -h 127.0.0.1 -p ${inst.port} -U postgres -w -c "CREATE ROLE odoo LOGIN SUPERUSER CREATEDB;" 2>nul`,
            { timeout: 5000 }
          )
        } catch {}
        configured = true
        return {
          success: true,
          message: `PostgreSQL ${inst.version} listo en puerto ${inst.port}`,
          host: '127.0.0.1',
          port: inst.port,
        }
      }
    }
    // If none have trust, try to configure the first one
    for (const inst of installs) {
      if (configurePG(inst)) {
        configured = true
        return {
          success: true,
          message: `PostgreSQL ${inst.version} configurado en puerto ${inst.port}`,
          host: '127.0.0.1',
          port: inst.port,
        }
      }
    }
    return {
      success: true,
      message: 'PostgreSQL disponible pero no se pudo configurar acceso para odoo. Usa db_host=127.0.0.1 y db_port=5433',
      host: '127.0.0.1',
      port: 5433,
    }
  }

  if (status.installed && !status.running) {
    return startPostgreSQL()
  }

  if (!isWindows()) {
    return {
      success: false,
      message: 'PostgreSQL no está instalado. En Linux: sudo apt install postgresql',
      host: 'localhost',
      port: 5432,
    }
  }

  return installPostgreSQL()
}

function installPostgreSQL(): PGResult {
  const version = PG_VERSIONS[0]
  const tempDir = process.env.TEMP || 'C:\\Windows\\Temp'
  const installerPath = path.join(tempDir, `postgresql-${version}-1-windows-x64.exe`)
  const pgDir = path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'PostgreSQL', version)

  if (!existsSync(installerPath)) {
    const url = `https://get.enterprisedb.com/postgresql/postgresql-${version}-1-windows-x64.exe`
    console.log(`[postgres] Downloading PostgreSQL ${version} installer from ${url}...`)
    try {
      execSync(
        `powershell -Command "Invoke-WebRequest -Uri '${url}' -OutFile '${installerPath}' -UseBasicParsing"`,
        { timeout: 600000 }
      )
      console.log('[postgres] Download complete')
    } catch (e: any) {
      if (existsSync(installerPath)) { try { unlinkSync(installerPath) } catch {} }
      return { success: false, message: `Error descargando PostgreSQL: ${e.message}`, host: 'localhost', port: 5432 }
    }
  }

  const scriptPath = path.join(tempDir, '_install_pg.ps1')
  const script = `Start-Process -FilePath "${installerPath}" -ArgumentList @(
    "--mode", "unattended",
    "--unattendedmodeui", "minimal",
    "--install_runtimes", "0",
    "--install_stein", "0",
    "--install_pgadmin", "0",
    "--serverport", "5432",
    "--superpassword", "postgres",
    "--prefix", "${pgDir}"
  ) -Verb RunAs -Wait -PassThru | ForEach-Object { Exit $$_.ExitCode }`
  writeFileSync(scriptPath, script, 'utf8')

  try {
    console.log('[postgres] Installing PostgreSQL (this may take a few minutes)...')
    execSync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, { timeout: 600000, stdio: 'pipe' })
    console.log('[postgres] Installation completed')
  } catch (e: any) {
    return { success: false, message: `Error instalando PostgreSQL: ${e.message}`, host: 'localhost', port: 5432 }
  } finally {
    try { unlinkSync(scriptPath) } catch {}
  }

  const startResult = startPostgreSQL()
  if (!startResult.success) return startResult

  // Configure
  const installs = scanPGInstalls()
  for (const inst of installs) {
    configurePG(inst)
  }

  pgCache = null
  return { success: true, message: `PostgreSQL ${version} instalado y configurado`, host: '127.0.0.1', port: 5432 }
}

function startPostgreSQL(): PGResult {
  if (isLinux()) {
    try {
      execSync('sudo systemctl start postgresql 2>/dev/null || systemctl start postgresql 2>/dev/null', { timeout: 10000 })
      return { success: true, message: 'PostgreSQL iniciado' }
    } catch (e: any) {
      return { success: false, message: e.message || 'No se pudo iniciar PostgreSQL' }
    }
  }

  const installs = scanPGInstalls()
  for (const inst of installs) {
    try {
      execSync(`sc start "${inst.serviceName}" 2>nul || net start "${inst.serviceName}" 2>nul`, { timeout: 15000 })
    } catch {}
  }

  try {
    for (const inst of installs) {
      try {
        const out = execSync(`"${path.join(inst.binDir, 'pg_isready.exe')}" -p ${inst.port} 2>nul`, { encoding: 'utf8', timeout: 2000 })
        if (out.includes('accepting')) {
          return { success: true, message: `PostgreSQL iniciado en puerto ${inst.port}`, host: '127.0.0.1', port: inst.port }
        }
      } catch {}
    }
  } catch {}

  return { success: false, message: 'PostgreSQL instalado pero no se pudo iniciar el servicio' }
}
