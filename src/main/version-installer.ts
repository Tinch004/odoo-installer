import { execSync } from 'child_process'
import { existsSync, mkdirSync, writeFileSync } from 'fs'

export interface OdooVersion {
  version: string
  branch: string
  pythonVersion: string
  supported: boolean
}

export class VersionInstaller {
  listAvailable(): OdooVersion[] {
    return [
      { version: '18.0', branch: '18.0', pythonVersion: '3.12', supported: true },
      { version: '17.0', branch: '17.0', pythonVersion: '3.11', supported: true },
      { version: '16.0', branch: '16.0', pythonVersion: '3.10', supported: true },
      { version: '15.0', branch: '15.0', pythonVersion: '3.9', supported: true },
    ]
  }

  detectLocal(): Array<{ version: string; path: string; hasService: boolean }> {
    const results: Array<{ version: string; path: string; hasService: boolean }> = []
    const projectDir = '/home/fran/proyectos'
    const versions = ['odoo', 'odoo17', 'odoo16', 'odoo15', 'odoo14']

    for (const dir of versions) {
      const fullPath = `${projectDir}/${dir}`
      const configPath = `${fullPath}/odoo.conf`
      if (existsSync(configPath)) {
        const version = dir === 'odoo' ? '18.0' : dir.replace('odoo', '') + '.0'
        const hasService = this.checkService(dir)
        results.push({ version, path: fullPath, hasService })
      }
    }
    return results
  }

  async install(version: string): Promise<{ success: boolean; message: string }> {
    try {
      const branch = version
      const dirName = `odoo${version.replace('.', '')}`
      const targetDir = `/home/fran/proyectos/${dirName}`

      if (existsSync(targetDir)) {
        return { success: false, message: `Directory ${targetDir} already exists` }
      }

      // Clone Odoo
      execSync(`git clone --branch ${branch} --depth 1 https://github.com/odoo/odoo.git ${targetDir}`, { timeout: 180000 })

      // Determine Python version
      const pythonVer = this.getPythonForVersion(version)
      
      // Create venv
      execSync(`${pythonVer} -m venv ${targetDir}/venv`, { timeout: 30000 })

      // Install dependencies
      execSync(`source ${targetDir}/venv/bin/activate && pip install --upgrade pip wheel setuptools && pip install -r ${targetDir}/requirements.txt`, { timeout: 180000 })

      // Install system deps
      execSync('apt-get install -y libpq-dev libxml2-dev libxslt1-dev libldap2-dev libsasl2-dev libssl-dev libjpeg-dev libz-dev libffi-dev 2>/dev/null || true', { timeout: 60000 })

      // Create config file
      const config = `[options]
addons_path = ${targetDir}/addons,${targetDir}/odoo/addons,${targetDir}/sources
db_host = False
db_port = False
db_user = odoo
db_password = False
logfile = /var/log/odoo/${dirName}-server.log
admin_passwd = admin
http_port = 80${version.replace('.', '')}
`
      mkdirSync(`${targetDir}/sources`, { recursive: true })
      writeFileSync(`${targetDir}/odoo.conf`, config)

      // Create systemd service
      const service = `[Unit]
Description=Odoo ${version} Open Source ERP and CRM
After=network.target

[Service]
Type=simple
User=odoo
Group=odoo
ExecStart=${targetDir}/venv/bin/python ${targetDir}/odoo-bin --config ${targetDir}/odoo.conf --logfile /var/log/odoo/${dirName}-server.log
KillMode=mixed

[Install]
WantedBy=multi-user.target
`
      writeFileSync(`/etc/systemd/system/${dirName}.service`, service)

      // Create log directory and set permissions
      execSync(`pkexec bash -c 'mkdir -p /var/log/odoo && touch /var/log/odoo/${dirName}-server.log && chown -R odoo:odoo /var/log/odoo && chmod o+x /home/fran && chown -R odoo:odoo ${targetDir} && chmod -R o+rX ${targetDir} && systemctl daemon-reload'`, { timeout: 30000 })

      // Create database
      execSync(`pkexec bash -c 'su - postgres -c "createdb -O odoo ${dirName}"'`, { timeout: 10000 })

      return { success: true, message: `Odoo ${version} installed at ${targetDir}. Run: systemctl start ${dirName}` }
    } catch (e: any) {
      return { success: false, message: e.message || 'Installation failed' }
    }
  }

  private getPythonForVersion(version: string): string {
    const v = parseFloat(version)
    if (v >= 18) return 'python3.12'
    if (v >= 17) return 'python3.11'
    if (v >= 16) return 'python3.10'
    if (v >= 15) return 'python3.9'
    if (v >= 14) return 'python3.8'
    return 'python3.10'
  }

  private checkService(name: string): boolean {
    try {
      const out = execSync(`systemctl is-active ${name} 2>/dev/null`, { encoding: 'utf8', timeout: 3000 })
      return out.trim() === 'active'
    } catch {
      return false
    }
  }
}
