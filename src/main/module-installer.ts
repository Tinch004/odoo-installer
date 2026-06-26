import { execSync } from 'child_process'
import { existsSync, mkdirSync, readdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { join, basename } from 'path'
import { OdooRPC } from './odoo-rpc'

export interface OCAModule {
  name: string
  repo: string
  url: string
  description: string
  category: string
  license: string
  stars: number
  updated: string
  compatibleVersions: string[]
}

export class ModuleInstaller {
  private odooRPC = new OdooRPC()

  async installLocal(db: string, sourcePath: string): Promise<{ success: boolean; message: string }> {
    try {
      const targetDir = '/home/fran/proyectos/odoo17/sources'
      if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true })

      const moduleName = basename(sourcePath)
      const targetPath = join(targetDir, moduleName)

      // Check if it's a zip file or directory
      if (sourcePath.endsWith('.zip') || sourcePath.endsWith('.tgz') || sourcePath.endsWith('.tar.gz')) {
        execSync(`mkdir -p "${targetPath}" && tar -xzf "${sourcePath}" -C "${targetPath}" --strip-components=1 2>/dev/null || unzip -o "${sourcePath}" -d "${targetPath}" 2>/dev/null`, { timeout: 30000 })
      } else {
        // It's a directory, copy contents
        if (existsSync(targetPath)) rmSync(targetPath, { recursive: true })
        execSync(`cp -r "${sourcePath}" "${targetPath}"`, { timeout: 30000 })
      }

      // Verify manifest exists
      const manifestPath = join(targetPath, '__manifest__.py')
      if (!existsSync(manifestPath)) {
        // Check subdirectories
        const subdirs = readdirSync(targetPath, { withFileTypes: true }).filter(d => d.isDirectory())
        for (const sub of subdirs) {
          const subManifest = join(targetPath, sub.name, '__manifest__.py')
          if (existsSync(subManifest)) {
            // Move contents up
            execSync(`cp -r "${targetPath}/${sub.name}/"* "${targetPath}/"`, { timeout: 10000 })
            break
          }
        }
      }

      // Install via Odoo
      if (!existsSync(join(targetPath, '__manifest__.py'))) {
        return { success: false, message: `Invalid module: no __manifest__.py found in ${moduleName}` }
      }

      // Update addons path in config and restart
      this.updateAddonsPath(targetDir)
      
      // Restart service to pick up new module
      execSync('pkexec bash -c \'systemctl restart odoo17\'', { timeout: 15000 })

      // Then install module
      const result = await this.odooRPC.installModule(db, moduleName)
      if (result) {
        return { success: true, message: `Module ${moduleName} installed successfully` }
      }
      return { success: true, message: `Module ${moduleName} copied to addons. Use Odoo UI to activate it.` }
    } catch (e: any) {
      return { success: false, message: e.message || 'Installation failed' }
    }
  }

  async searchOCA(query: string, odooVersion: string = '17.0'): Promise<OCAModule[]> {
    const results: OCAModule[] = []
    try {
      // Search OCA GitHub org
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}+org:OCA+language:python&sort=stars&per_page=50`
      const res = await fetch(url, {
        headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'OdooManager' },
        signal: AbortSignal.timeout(10000),
      })
      const data = await res.json()
      if (data.items) {
        for (const item of data.items) {
          const compatibleVersions = await this.getRepoBranches(item.full_name)
          if (compatibleVersions.includes(odooVersion)) {
            results.push({
              name: item.name,
              repo: item.full_name,
              url: item.html_url,
              description: item.description || '',
              category: this.guessCategory(item.name, item.description),
              license: item.license?.spdx_id || '',
              stars: item.stargazers_count || 0,
              updated: item.updated_at || '',
              compatibleVersions,
            })
          }
        }
      }
    } catch {}

    // Fallback: return curated OCA repos
    if (results.length === 0) {
      return this.getCuratedRepos(query, odooVersion)
    }
    return results.slice(0, 30)
  }

  private async getRepoBranches(repo: string): Promise<string[]> {
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/branches?per_page=30`, {
        headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'OdooManager' },
        signal: AbortSignal.timeout(5000),
      })
      const data = await res.json()
      return (data as any[]).map(b => b.name).filter((b: string) => /^\d+\.\d+$/.test(b))
    } catch {
      return []
    }
  }

  async installFromStore(db: string, repoUrl: string, odooVersion: string): Promise<{ success: boolean; message: string }> {
    try {
      const targetDir = '/home/fran/proyectos/odoo17/sources'
      if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true })

      const repoName = basename(repoUrl.replace('.git', ''))
      const repoPath = join('/tmp/odoo-modules', repoName)

      // Clone repo
      if (existsSync(repoPath)) rmSync(repoPath, { recursive: true })
      execSync(`mkdir -p /tmp/odoo-modules && git clone --depth 1 --branch ${odooVersion} ${repoUrl} ${repoPath} 2>/dev/null || git clone --depth 1 ${repoUrl} ${repoPath}`, { timeout: 60000 })

      // Copy all module directories to sources
      const entries = readdirSync(repoPath, { withFileTypes: true })
      let installed = 0
      for (const entry of entries) {
        if (entry.isDirectory() && existsSync(join(repoPath, entry.name, '__manifest__.py'))) {
          const target = join(targetDir, entry.name)
          if (existsSync(target)) rmSync(target, { recursive: true })
          execSync(`cp -r "${join(repoPath, entry.name)}" "${targetDir}/"`, { timeout: 10000 })
          installed++
        }
      }

      // Clean up
      rmSync(repoPath, { recursive: true })

      if (installed === 0) return { success: false, message: 'No valid modules found in repository' }

      // Update addons path and restart
      this.updateAddonsPath(targetDir)
      execSync('pkexec bash -c \'systemctl restart odoo17\'', { timeout: 15000 })

      return { success: true, message: `${installed} module(s) downloaded. Use Module Manager to install them.` }
    } catch (e: any) {
      return { success: false, message: e.message || 'Failed to install from store' }
    }
  }

  private updateAddonsPath(sourcesDir: string): void {
    const configPath = '/home/fran/proyectos/odoo17/odoo.conf'
    if (!existsSync(configPath)) return
    try {
      let raw = readFileSync(configPath, 'utf8')
      if (!raw.includes(sourcesDir)) {
        raw = raw.replace(/addons_path\s*=\s*(.+)/, (match, p1) => {
          if (!p1.includes(sourcesDir)) {
            return `addons_path = ${p1},${sourcesDir}`
          }
          return match
        })
        writeFileSync(configPath, raw)
      }
    } catch {}
  }

  private guessCategory(name: string, description: string): string {
    const text = `${name} ${description}`.toLowerCase()
    if (text.includes('account') || text.includes('invoice') || text.includes('payment')) return 'Accounting'
    if (text.includes('sale') || text.includes('order') || text.includes('crm')) return 'Sales/CRM'
    if (text.includes('stock') || text.includes('logistic') || text.includes('warehouse')) return 'Inventory/Logistics'
    if (text.includes('hr') || text.includes('employee') || text.includes('payroll')) return 'Human Resources'
    if (text.includes('manufact') || text.includes('production') || text.includes('mrp')) return 'Manufacturing'
    if (text.includes('purchase') || text.includes('procurement')) return 'Purchasing'
    if (text.includes('website') || text.includes('ecommerce') || text.includes('shop')) return 'Website/E-commerce'
    if (text.includes('pos') || text.includes('point of sale') || text.includes('retail')) return 'Point of Sale'
    if (text.includes('project') || text.includes('task') || text.includes('todo')) return 'Project Management'
    if (text.includes('email') || text.includes('mail') || text.includes('communicat')) return 'Communication'
    if (text.includes('report') || text.includes('print') || text.includes('document')) return 'Reporting'
    if (text.includes('theme') || text.includes('ui') || text.includes('view')) return 'User Interface'
    if (text.includes('web') || text.includes('api') || text.includes('rest')) return 'Technical/Web'
    if (text.includes('tool') || text.includes('server') || text.includes('queue')) return 'Technical Tools'
    return 'Other'
  }

  private getCuratedRepos(query: string, odooVersion: string): OCAModule[] {
    const curated = [
      { name: 'account-invoicing', repo: 'OCA/account-invoicing', desc: 'Accounting & invoicing modules', category: 'Accounting' },
      { name: 'sale-workflow', repo: 'OCA/sale-workflow', desc: 'Sales workflow enhancements', category: 'Sales/CRM' },
      { name: 'stock-logistics', repo: 'OCA/stock-logistics', desc: 'Stock & logistics management', category: 'Inventory/Logistics' },
      { name: 'web', repo: 'OCA/web', desc: 'Web interface improvements', category: 'User Interface' },
      { name: 'server-tools', repo: 'OCA/server-tools', desc: 'Server-side development tools', category: 'Technical Tools' },
      { name: 'hr', repo: 'OCA/hr', desc: 'Human resources modules', category: 'Human Resources' },
      { name: 'manufacturing', repo: 'OCA/manufacturing', desc: 'Manufacturing & MRP modules', category: 'Manufacturing' },
      { name: 'e-commerce', repo: 'OCA/e-commerce', desc: 'E-commerce & website modules', category: 'Website/E-commerce' },
      { name: 'project', repo: 'OCA/project', desc: 'Project management modules', category: 'Project Management' },
      { name: 'pos', repo: 'OCA/pos', desc: 'Point of Sale modules', category: 'Point of Sale' },
      { name: 'reporting-engine', repo: 'OCA/reporting-engine', desc: 'Reporting & printing modules', category: 'Reporting' },
      { name: 'purchase-workflow', repo: 'OCA/purchase-workflow', desc: 'Purchasing workflow modules', category: 'Purchasing' },
      { name: 'queue', repo: 'OCA/queue', desc: 'Job queue & async processing', category: 'Technical Tools' },
      { name: 'partner-contact', repo: 'OCA/partner-contact', desc: 'Partner & contact management', category: 'Accounting' },
      { name: 'product-attribute', repo: 'OCA/product-attribute', desc: 'Product attribute modules', category: 'Inventory/Logistics' },
      { name: 'commission', repo: 'OCA/commission', desc: 'Commission management', category: 'Sales/CRM' },
      { name: 'contract', repo: 'OCA/contract', desc: 'Contract management', category: 'Accounting' },
      { name: 'field-service', repo: 'OCA/field-service', desc: 'Field service management', category: 'Project Management' },
      { name: 'helpdesk', repo: 'OCA/helpdesk', desc: 'Helpdesk & support modules', category: 'Sales/CRM' },
      { name: 'l10n-argentina', repo: 'OCA/l10n-argentina', desc: 'Argentinian localization', category: 'Accounting' },
    ]

    const q = query.toLowerCase()
    return curated
      .filter(m => !q || m.name.includes(q) || m.desc.toLowerCase().includes(q) || m.category.toLowerCase().includes(q))
      .map(m => ({
        name: m.name,
        repo: m.repo,
        url: `https://github.com/${m.repo}`,
        description: m.desc,
        category: m.category,
        license: 'LGPL-3',
        stars: 0,
        updated: '',
        compatibleVersions: ['16.0', '17.0', '18.0'],
      }))
  }
}
