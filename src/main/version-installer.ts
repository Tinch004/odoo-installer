import { execSync } from 'child_process'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import path from 'path'
import { getPlatform, getProjectsDir, getOdooDir, getAddonsDir, getPythonCommand, getVenvPython, getPipCommand, quoteForShell, isWindows, isLinux, requireLinux, getServiceName } from './platform'
import { ensurePostgreSQL } from './postgres'

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
    const projectDir = getProjectsDir()
    const versions = ['odoo', 'odoo17', 'odoo16', 'odoo15', 'odoo14']

    for (const dir of versions) {
      const fullPath = path.join(projectDir, dir)
      const configPath = path.join(fullPath, 'odoo.conf')
      if (existsSync(configPath)) {
        const version = dir === 'odoo' ? '18.0' : dir.replace('odoo', '') + '.0'
        const hasService = isLinux() ? this.checkService(dir) : false
        results.push({ version, path: fullPath, hasService })
      }
    }
    return results
  }

  async install(version: string): Promise<{ success: boolean; message: string }> {
    try {
      const branch = version
      const targetDir = getOdooDir(version)

      if (existsSync(targetDir)) {
        return { success: false, message: `Directory ${targetDir} already exists` }
      }

      // Clone Odoo
      execSync(`git clone --branch ${branch} --depth 1 https://github.com/odoo/odoo.git "${targetDir}"`, { timeout: 180000 })

      // Ensure PostgreSQL is available
      const pgReq = ensurePostgreSQL()
      if (!pgReq.success) return pgReq
      const pgHost = pgReq.host || '127.0.0.1'
      const pgPort = pgReq.port || 5432

      // Determine Python version
      const pythonVer = getPythonCommand(version)

      // Create venv (fallback to virtualenv if venv module missing)
      const venvDir = path.join(targetDir, 'venv')
      try {
        execSync(`${quoteForShell(pythonVer)} -m venv "${venvDir}"`, { timeout: 60000 })
      } catch {
        execSync(`${quoteForShell(pythonVer)} -m pip install virtualenv`, { timeout: 60000 })
        execSync(`${quoteForShell(pythonVer)} -m virtualenv "${venvDir}"`, { timeout: 120000 })
      }

      // Install dependencies
      const venvPython = getVenvPython(venvDir)
      const reqFile = path.join(targetDir, 'requirements.txt')

      execSync(
        `${quoteForShell(venvPython)} -m pip install --upgrade pip wheel setuptools`,
        { timeout: 120000 }
      )
      if (existsSync(reqFile)) {
        execSync(
          `${quoteForShell(venvPython)} -m pip install -r "${reqFile}"`,
          { timeout: 180000 }
        )
      }

      // Install system deps (Linux only)
      if (isLinux()) {
        execSync('apt-get install -y libpq-dev libxml2-dev libxslt1-dev libldap2-dev libsasl2-dev libssl-dev libjpeg-dev libz-dev libffi-dev 2>/dev/null || true', { timeout: 60000 })
      }

      // Create config file
      const logfileName = `odoo${version.replace('.', '')}-server.log`
      const logDir = isLinux() ? '/var/log/odoo' : path.join(targetDir, 'log')
      if (!isLinux()) mkdirSync(logDir, { recursive: true })

      const config = `[options]
addons_path = ${path.join(targetDir, 'addons')},${path.join(targetDir, 'odoo', 'addons')},${path.join(targetDir, 'sources')}
db_host = ${pgHost}
db_port = ${pgPort}
db_user = odoo
db_password = False
logfile = ${path.join(logDir, logfileName)}
admin_passwd = admin
http_port = 80${version.split('.')[0]}
`
      mkdirSync(path.join(targetDir, 'sources'), { recursive: true })
      writeFileSync(path.join(targetDir, 'odoo.conf'), config)

      if (isLinux()) {
        // Create systemd service
        const serviceName = `odoo${version.replace('.', '')}`
        const service = `[Unit]
Description=Odoo ${version} Open Source ERP and CRM
After=network.target

[Service]
Type=simple
User=odoo
Group=odoo
ExecStart=${getVenvPython(path.join(targetDir, 'venv'))} ${path.join(targetDir, 'odoo-bin')} --config ${path.join(targetDir, 'odoo.conf')} --logfile ${path.join(logDir, logfileName)}
KillMode=mixed

[Install]
WantedBy=multi-user.target
`
        writeFileSync(`/etc/systemd/system/${serviceName}.service`, service)

        // Create log directory and set permissions
        execSync(
          `pkexec bash -c 'mkdir -p /var/log/odoo && touch /var/log/odoo/${logfileName} && chown -R odoo:odoo /var/log/odoo && chmod o+x ${getProjectsDir()} && chown -R odoo:odoo ${targetDir} && chmod -R o+rX ${targetDir} && systemctl daemon-reload'`,
          { timeout: 30000 }
        )

        // Create database
        execSync(
          `pkexec bash -c 'su - postgres -c "createdb -O odoo ${serviceName}"'`,
          { timeout: 10000 }
        )

        return { success: true, message: `Odoo ${version} installed at ${targetDir}. Run: systemctl start ${serviceName}` }
      }

      return { success: true, message: `Odoo ${version} installed at ${targetDir}` }
    } catch (e: any) {
      return { success: false, message: e.message || 'Installation failed' }
    }
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
