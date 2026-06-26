import { execSync } from 'child_process'
import { existsSync, readFileSync, readdirSync } from 'fs'

export interface ModuleInfo {
  id: number
  name: string
  display_name: string
  state: 'installed' | 'uninstalled' | 'to install' | 'to upgrade' | 'to remove'
  category: string
  version: string
  summary: string
  author: string
  website: string
  license: string
  application: boolean
  depends: string[]
  auto_install: boolean
}

export interface OdooConnectionConfig {
  url: string
  port: number
  db: string
  username: string
  password: string
}

export class OdooRPC {
  private config: OdooConnectionConfig | null = null

  async connect(config: OdooConnectionConfig): Promise<boolean> {
    this.config = config
    try {
      const res = await this.call('/web/database/list', {})
      return Array.isArray(res) && res.length >= 0
    } catch {
      return false
    }
  }

  private async call(endpoint: string, params: any): Promise<any> {
    if (!this.config) throw new Error('Not connected')
    const url = `http://${this.config.url}:${this.config.port}${endpoint}`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params,
        id: Math.floor(Math.random() * 100000),
      }),
    })
    const data = await response.json()
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
    return data.result
  }

  private async authCall(model: string, method: string, args: any[] = [], kwargs: any = {}): Promise<any> {
    if (!this.config) throw new Error('Not connected')
    const { db, username, password } = this.config
    return this.call('/jsonrpc', {
      service: 'object',
      method: 'execute_kw',
      args: [db, 1, password, model, method, args, kwargs],
    })
  }

  private async commonCall(service: string, method: string, args: any[] = []): Promise<any> {
    return this.call('/jsonrpc', { service, method, args })
  }

  // Alternative: use odoo-bin command line
  private execOdoo(odbBin: string, args: string): string {
    try {
      return execSync(`${odbBin} ${args} 2>&1`, { encoding: 'utf8', timeout: 120000 })
    } catch (e: any) {
      return e.stdout || e.message || 'Command failed'
    }
  }

  async listModules(db: string): Promise<ModuleInfo[]> {
    // Try RPC first
    try {
      const ids: number[] = await this.authCall('ir.module.module', 'search', [[]])
      const modules: any[] = await this.authCall('ir.module.module', 'read', [ids])
      return modules.map(m => ({
        id: m.id,
        name: m.name,
        display_name: m.display_name || m.name,
        state: m.state,
        category: m.category || 'Uncategorized',
        version: m.versions || m.version || '',
        summary: m.summary || '',
        author: m.author || '',
        website: m.website || '',
        license: m.license || '',
        application: m.application || false,
        depends: m.depends || [],
        auto_install: m.auto_install || false,
      }))
    } catch {
      // Fallback: scan filesystem
      return this.scanLocalModules()
    }
  }

  async installModule(db: string, moduleName: string): Promise<boolean> {
    try {
      await this.authCall('ir.module.module', 'button_immediate_install', [[[['name', '=', moduleName]]]])
      return true
    } catch {
      // Fallback to command line
      try {
        const odooBin = this.findOdooBin()
        if (odooBin) {
          this.execOdoo(odooBin, `-d ${db} -i ${moduleName} --stop-after-init`)
          return true
        }
      } catch {}
      return false
    }
  }

  async uninstallModule(db: string, moduleName: string): Promise<boolean> {
    try {
      await this.authCall('ir.module.module', 'button_immediate_uninstall', [[[['name', '=', moduleName]]]])
      return true
    } catch {
      return false
    }
  }

  async upgradeModule(db: string, moduleName: string): Promise<boolean> {
    try {
      await this.authCall('ir.module.module', 'button_immediate_upgrade', [[[['name', '=', moduleName]]]])
      return true
    } catch {
      try {
        const odooBin = this.findOdooBin()
        if (odooBin) {
          this.execOdoo(odooBin, `-d ${db} -u ${moduleName} --stop-after-init`)
          return true
        }
      } catch {}
      return false
    }
  }

  async getDatabases(): Promise<string[]> {
    try {
      return await this.commonCall('db', 'list', [])
    } catch {
      return []
    }
  }

  private findOdooBin(): string | null {
    const candidates = [
      '/home/fran/proyectos/odoo17/odoo-bin',
      '/home/fran/proyectos/odoo16/odoo-bin',
      '/usr/bin/odoo',
    ]
    for (const c of candidates) {
      if (existsSync(c)) return c
    }
    return null
  }

  private scanLocalModules(): ModuleInfo[] {
    const modules: ModuleInfo[] = []
    const addonsDirs = [
      '/home/fran/proyectos/odoo17/addons',
      '/home/fran/proyectos/odoo17/odoo/addons',
      '/home/fran/proyectos/odoo17/sources',
      '/home/fran/proyectos/pos_mercadopago_point',
    ]
    for (const dir of addonsDirs) {
      if (!existsSync(dir)) continue
      try {
        const entries = readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (!entry.isDirectory()) continue
          const manifestPath = `${dir}/${entry.name}/__manifest__.py`
          if (!existsSync(manifestPath)) continue
          try {
            const raw = readFileSync(manifestPath, 'utf8')
            const name = this.extractManifest(raw, 'name') || entry.name
            const version = this.extractManifest(raw, 'version') || '1.0'
            const category = this.extractManifest(raw, 'category') || 'Uncategorized'
            const summary = this.extractManifest(raw, 'summary') || ''
            const author = this.extractManifest(raw, 'author') || ''
            const license = this.extractManifest(raw, 'license') || 'LGPL-3'
            const application = this.extractManifest(raw, 'application') === 'True'
            const auto_install = this.extractManifest(raw, 'auto_install') === 'True'
            const dependsRaw = this.extractManifest(raw, 'depends') || '[]'
            const depends = dependsRaw.replace(/[\[\]'\s]/g, '').split(',').filter(Boolean)
            modules.push({
              id: modules.length + 1,
              name: entry.name,
              display_name: name,
              state: 'uninstalled',
              category,
              version,
              summary,
              author,
              website: '',
              license,
              application,
              depends,
              auto_install,
            })
          } catch {}
        }
      } catch {}
    }
    return modules
  }

  private extractManifest(raw: string, key: string): string | null {
    const m = raw.match(new RegExp(`['"]${key}['"]\\s*:\\s*['"]([^'"]+)['"]`))
    return m ? m[1] : null
  }
}
