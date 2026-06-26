import { execSync, exec } from 'child_process'
import { readFileSync, readdirSync, existsSync } from 'fs'

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

export class ServiceManager {
  private detectedServices: ServiceInfo[] = []

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

    // Also scan common locations for Odoo instances not managed by systemd
    this.scanLocalInstances(services)
    this.detectedServices = services
    return services
  }

  private scanLocalInstances(services: ServiceInfo[]): void {
    const projectDir = '/home/fran/proyectos'
    if (!existsSync(projectDir)) return
    try {
      const entries = readdirSync(projectDir)
      for (const entry of entries) {
        if (entry.startsWith('odoo') && !services.find(s => s.name === entry)) {
          const configPath = `${projectDir}/${entry}/odoo.conf`
          if (existsSync(configPath)) {
            try {
              const raw = readFileSync(configPath, 'utf8')
              const port = this.extractConfig(raw, 'http_port') || '8069'
              const addons = (this.extractConfig(raw, 'addons_path') || '').split(',').map(s => s.trim()).filter(Boolean)
              const dbUser = this.extractConfig(raw, 'db_user') || 'odoo'
              const logFile = this.extractConfig(raw, 'logfile') || ''
              services.push({
                name: entry,
                version: this.detectVersion(entry),
                port: parseInt(port),
                status: 'stopped',
                enabled: false,
                pid: null,
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

  private detectVersion(dir: string): string {
    try {
      const manifestPath = `/home/fran/proyectos/${dir}/odoo/release.py`
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

    // Try to get more info from service config
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

      // Parse config from exec start
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

    // Detect version
    if (name === 'odoo17') version = '17.0'
    else if (name === 'odoo' || name === 'odoo18') version = '18.0'
    else {
      try {
        const releasePath = `/usr/lib/python3/dist-packages/odoo/release.py`
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
    try {
      const cmd = `pkexec bash -c 'systemctl ${action} ${name}'`
      await this.execAsync(cmd)
      return { success: true, message: `Service ${name} ${action}ed successfully` }
    } catch (e: any) {
      // Fallback to sudo without password if pkexec fails
      try {
        const cmd = `systemctl ${action} ${name}`
        await this.execAsync(cmd)
        return { success: true, message: `Service ${name} ${action}ed successfully` }
      } catch (e2: any) {
        return { success: false, message: e2.message || `Failed to ${action} ${name}` }
      }
    }
  }

  async getLogs(name: string): Promise<string> {
    try {
      const out = execSync(`journalctl -u ${name} --no-pager -n 100 2>/dev/null || tail -100 /var/log/odoo/${name}-server.log 2>/dev/null`, { encoding: 'utf8', timeout: 5000 })
      return out || 'No logs available'
    } catch {
      return 'Unable to fetch logs'
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
