import { spawn, execSync, exec, ChildProcess } from 'child_process'
import { readFileSync, readdirSync, existsSync } from 'fs'
import path from 'path'
import { getProjectsDir, getOdooDir, isLinux, isWindows, getVenvPython, requireLinux, getServiceName } from './platform'

export interface ServiceInfo {
  name: string
  version: string
  port: number
  status: 'running' | 'stopped' | 'error'
  enabled: boolean
  pid: number | null
  memory: string
  configFile: string
  addonsPaths: string[]
  dbUser: string
  dbHost: string
  dbPort: number
  logFile: string
}

export interface ConnectionInfo {
  host: string
  port: number
  db: string
  username: string
  password: string
  instanceName: string
  logFile: string
}

export class ServiceManager {
  static processRegistry = new Map<string, ChildProcess>()

  private detectedServices: ServiceInfo[] = []

  static registerProcess(name: string, proc: ChildProcess): void {
    const existing = ServiceManager.processRegistry.get(name)
    if (existing && existing.pid && !existing.killed) {
      try { existing.kill('SIGTERM') } catch {}
    }
    ServiceManager.processRegistry.set(name, proc)
    proc.on('exit', () => {
      ServiceManager.processRegistry.delete(name)
    })
  }

  static isProcessAlive(name: string): boolean {
    const proc = ServiceManager.processRegistry.get(name)
    if (!proc) return false
    if (!proc.pid) return false
    try {
      if (isWindows()) {
        execSync(`tasklist /fi "PID eq ${proc.pid}" 2>nul | findstr "${proc.pid}"`, { encoding: 'utf8', timeout: 3000 })
        return true
      }
      return process.kill(proc.pid, 0)
    } catch {
      return false
    }
  }

  private execAsync(cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(cmd, { timeout: 10000 }, (err, stdout, stderr) => {
        if (err) reject(err)
        else resolve(stdout || stderr)
      })
    })
  }

  listServices(): ServiceInfo[] {
    const services: ServiceInfo[] = []

    if (isLinux()) {
      try {
        const out = execSync('systemctl list-units --type=service --all --no-legend 2>/dev/null | grep -i odoo', { encoding: 'utf8', timeout: 5000 })
        const lines = out.trim().split('\n').filter(Boolean)
        for (const line of lines) {
          const parts = line.trim().split(/\s+/)
          const name = parts[0]?.replace('.service', '')
          const loadState = parts[1]
          const activeState = parts[2]
          const subState = parts[3]
          if (name && name.includes('odoo')) {
            const info = this.inspectService(name, activeState, subState)
            services.push(info)
          }
        }
      } catch {
        // No Odoo services found via systemctl
      }
    }

    this.scanLocalInstances(services)
    this.detectedServices = services
    return services
  }

  private scanLocalInstances(services: ServiceInfo[]): void {
    const projectDir = getProjectsDir()
    if (!existsSync(projectDir)) return
    try {
      const entries = readdirSync(projectDir)
      for (const entry of entries) {
        if (entry.startsWith('odoo') && !services.find(s => s.name === entry)) {
          const instancePath = path.join(projectDir, entry)
          const configPath = path.join(instancePath, 'odoo.conf')
          if (existsSync(configPath)) {
            try {
              const raw = readFileSync(configPath, 'utf8')
              const port = this.extractConfig(raw, 'http_port') || '8069'
              const addons = (this.extractConfig(raw, 'addons_path') || '').split(',').map(s => s.trim()).filter(Boolean)
              const dbUser = this.extractConfig(raw, 'db_user') || 'odoo'
              const logFile = this.extractConfig(raw, 'logfile') || ''

              const isRunning = !isLinux() && this.checkProcessRunning(instancePath, entry)

              let pid: number | null = null
              if (isRunning) {
                const proc = ServiceManager.processRegistry.get(entry)
                if (proc?.pid) pid = proc.pid
              }

              services.push({
                name: entry,
                version: this.detectVersion(entry),
                port: parseInt(port),
                status: isRunning ? 'running' : 'stopped',
                enabled: false,
                pid,
                memory: '0',
                configFile: configPath,
                addonsPaths: addons,
                dbUser,
                dbHost: this.extractConfig(raw, 'db_host') || 'localhost',
                dbPort: parseInt(this.extractConfig(raw, 'db_port') || '5432'),
                logFile,
              })
            } catch {}
          }
        }
      }
    } catch {}
  }

  private checkProcessRunning(instancePath: string, name: string): boolean {
    if (ServiceManager.isProcessAlive(name)) return true
    return false
  }

  private detectVersion(dir: string): string {
    try {
      const projectDir = getProjectsDir()
      const manifestPath = path.join(projectDir, dir, 'odoo', 'release.py')
      if (existsSync(manifestPath)) {
        const content = readFileSync(manifestPath, 'utf8')
        const m = content.match(/version_info\s*=\s*\((\d+),\s*(\d+)/)
        if (m) return `${m[1]}.${m[2]}`
      }
    } catch {}
    return dir.replace('odoo', '') || 'unknown'
  }

  private extractConfig(raw: string, key: string): string | null {
    const m = raw.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, 'm'))
    return m ? m[1].trim() : null
  }

  private inspectService(name: string, activeState: string, subState: string): ServiceInfo {
    const status: 'running' | 'stopped' | 'error' =
      activeState === 'active' && subState === 'running' ? 'running' :
      activeState === 'inactive' || subState === 'dead' ? 'stopped' : 'error'

    let pid: number | null = null
    let memory = '0'
    let port = 8069
    let version = 'unknown'
    let addonsPaths: string[] = []
    let dbUser = 'odoo'
    let dbHost = 'localhost'
    let dbPort = 5432
    let configFile = ''
    let logFile = ''

    if (isLinux()) {
      try {
        const cmdOut = execSync(`systemctl show ${name} 2>/dev/null`, { encoding: 'utf8', timeout: 3000 })
        const getVal = (k: string) => {
          const m = cmdOut.match(new RegExp(`^${k}=(.+)$`, 'm'))
          return m ? m[1].trim() : ''
        }
        const execStart = getVal('ExecStart')
        const pidStr = getVal('MainPID')

        if (pidStr && pidStr !== '0') pid = parseInt(pidStr)
        const memMatch = cmdOut.match(/MemoryCurrent=(\d+)/)
        if (memMatch) memory = this.formatBytes(parseInt(memMatch[1]))

        const configMatch = execStart.match(/--config\s+(\S+)/)
        if (configMatch) {
          configFile = configMatch[1]
          try {
            const raw = readFileSync(configFile, 'utf8')
            port = parseInt(this.extractConfig(raw, 'http_port') || '8069')
            const addons = this.extractConfig(raw, 'addons_path')
            if (addons) addonsPaths = addons.split(',').map(s => s.trim()).filter(Boolean)
            dbUser = this.extractConfig(raw, 'db_user') || 'odoo'
            dbHost = this.extractConfig(raw, 'db_host') || 'localhost'
            dbPort = parseInt(this.extractConfig(raw, 'db_port') || '5432')
            logFile = this.extractConfig(raw, 'logfile') || ''
          } catch {}
        }
      } catch {}
    }

    // Detect version
    if (name === 'odoo17') version = '17.0'
    else if (name === 'odoo' || name === 'odoo18') version = '18.0'
    else if (!version || version === 'unknown') {
      try {
        const releasePath = path.join('/usr/lib/python3/dist-packages/odoo/release.py')
        if (existsSync(releasePath)) {
          const content = readFileSync(releasePath, 'utf8')
          const m = content.match(/version_info\s*=\s*\((\d+),\s*(\d+)/)
          if (m) version = `${m[1]}.${m[2]}`
        }
      } catch {}
    }

    return { name, version, port, status, enabled: false, pid, memory, configFile, addonsPaths, dbUser, dbHost, dbPort, logFile }
  }

  async control(name: string, action: 'start' | 'stop' | 'restart' | 'enable' | 'disable'): Promise<{ success: boolean; message: string }> {
    if (isLinux()) {
      try {
        const cmd = `pkexec bash -c 'systemctl ${action} ${name}'`
        await this.execAsync(cmd)
        return { success: true, message: `Service ${name} ${action}ed successfully` }
      } catch (e: any) {
        try {
          const cmd = `systemctl ${action} ${name}`
          await this.execAsync(cmd)
          return { success: true, message: `Service ${name} ${action}ed successfully` }
        } catch (e2: any) {
          return { success: false, message: e2.message || `Failed to ${action} ${name}` }
        }
      }
    }

    if (action === 'enable' || action === 'disable') {
      return { success: false, message: `${action} is not supported on Windows` }
    }

    if (action === 'restart') {
      const stopRes = await this.control(name, 'stop')
      if (!stopRes.success) return stopRes
      return this.control(name, 'start')
    }

    if (action === 'start') {
      return this.startOnWindows(name)
    }

    if (action === 'stop') {
      return this.stopOnWindows(name)
    }

    return { success: false, message: `Unknown action: ${action}` }
  }

  private async startOnWindows(name: string): Promise<{ success: boolean; message: string }> {
    try {
      const instancePath = path.join(getProjectsDir(), name)
      const odooBin = path.join(instancePath, 'odoo-bin')
      const configFile = path.join(instancePath, 'odoo.conf')
      const venvDir = path.join(instancePath, 'venv')
      const venvPython = getVenvPython(venvDir)

      if (!existsSync(odooBin)) {
        return { success: false, message: `odoo-bin not found in ${instancePath}` }
      }
      if (!existsSync(configFile)) {
        return { success: false, message: `odoo.conf not found in ${instancePath}` }
      }
      if (!existsSync(venvPython)) {
        return { success: false, message: `venv not found in ${instancePath}. Run "Complete & Run" first.` }
      }

      const raw = readFileSync(configFile, 'utf8')
      const logFile = this.extractConfig(raw, 'logfile') || path.join(instancePath, 'log', `${name}-server.log`)

      const bootCode = `import sys;sys.path.insert(0,r'${instancePath.replace(/\\/g, '\\\\')}');import odoo.cli;odoo.cli.main()`
      const proc = spawn(venvPython, ['-c', bootCode, '--config', configFile, '--logfile', logFile], {
        cwd: instancePath,
        detached: true,
        stdio: 'ignore',
        shell: true,
      })

      ServiceManager.registerProcess(name, proc)

      const port = this.extractConfig(raw, 'http_port') || '8069'
      return { success: true, message: `Odoo ${name} started on port ${port}` }
    } catch (e: any) {
      return { success: false, message: e.message || `Failed to start ${name}` }
    }
  }

  private async stopOnWindows(name: string): Promise<{ success: boolean; message: string }> {
    try {
      const proc = ServiceManager.processRegistry.get(name)
      if (proc && proc.pid) {
        try {
          execSync(`taskkill /f /t /pid ${proc.pid} 2>nul`, { timeout: 5000 })
        } catch {
          // already dead
        }
        ServiceManager.processRegistry.delete(name)
        return { success: true, message: `Service ${name} stopped` }
      }

      // Fallback: try to find by matching command line via wmic
      if (isWindows()) {
        try {
          const out = execSync(
            `wmic process where "name='python.exe' and commandline like '%${name}%'" get processid 2>nul`,
            { encoding: 'utf8', timeout: 3000 }
          )
          const lines = out.trim().split('\n').filter(l => l.trim() && !l.includes('ProcessId'))
          for (const line of lines) {
            const pid = parseInt(line.trim())
            if (pid) {
              execSync(`taskkill /f /t /pid ${pid} 2>nul`, { timeout: 5000 })
            }
          }
        } catch {}
      }

      return { success: true, message: `Service ${name} stopped` }
    } catch (e: any) {
      return { success: false, message: e.message || `Failed to stop ${name}` }
    }
  }

  async getLogs(name: string): Promise<string> {
    if (isLinux()) {
      try {
        const out = execSync(`journalctl -u ${name} --no-pager -n 100 2>/dev/null || tail -100 /var/log/odoo/${name}-server.log 2>/dev/null`, { encoding: 'utf8', timeout: 5000 })
        return out || 'No logs available'
      } catch {
        return 'Unable to fetch logs'
      }
    }

    // Windows: read log file from config
    try {
      const configPath = path.join(getProjectsDir(), name, 'odoo.conf')
      if (!existsSync(configPath)) return 'No config file found'
      const raw = readFileSync(configPath, 'utf8')
      const logFile = this.extractConfig(raw, 'logfile')
      if (!logFile || !existsSync(logFile)) return 'No log file found'
      const out = execSync(`powershell -Command "Get-Content '${logFile}' -Tail 100 2>$null"`, { encoding: 'utf8', timeout: 5000 })
      return out || 'Log file is empty'
    } catch {
      return 'Unable to read logs'
    }
  }

  getConnectionInfo(): ConnectionInfo | null {
    const services = this.listServices()
    const running = services.find(s => s.status === 'running') || services[0]
    if (!running) return null

    try {
      const raw = readFileSync(running.configFile, 'utf8')
      return {
        host: 'localhost',
        port: running.port,
        db: running.name,
        username: 'admin',
        password: this.extractConfig(raw, 'admin_passwd') || 'admin',
        instanceName: running.name,
        logFile: running.logFile,
      }
    } catch {
      return {
        host: 'localhost',
        port: running.port,
        db: running.name,
        username: 'admin',
        password: 'admin',
        instanceName: running.name,
        logFile: running.logFile,
      }
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }
}
