import { execSync } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'
import { isLinux, isWindows, getVenvPython } from './platform'
import { getPGStatus, ensurePostgreSQL } from './postgres'

export interface DoctorCheck {
  label: string
  status: 'ok' | 'fail' | 'skip'
  details?: string
}

export class SystemDoctor {
  check(instancePath: string, port: number = 8069): DoctorCheck[] {
    const results: DoctorCheck[] = []

    if (isLinux()) {
      results.push(this.checkService('PostgreSQL', 'systemctl is-active --quiet postgresql'))
      results.push(this.checkService('Odoo service', `systemctl is-active --quiet ${this.getServiceName(instancePath)}`))
    } else {
      const pgStatus = getPGStatus()
      results.push({
        label: 'PostgreSQL',
        status: pgStatus.running ? 'ok' : pgStatus.installed ? 'fail' : 'fail',
        details: pgStatus.running ? `v${pgStatus.version}` : 'No disponible',
      })
      results.push({ label: 'Odoo service', status: 'skip', details: 'No verificado en Windows' })
    }

    results.push(this.checkPath('Directorio de instalación', instancePath))
    results.push(this.checkPath('Odoo bin', path.join(instancePath, 'odoo-bin')))
    results.push(this.checkPath('Virtualenv', getVenvPython(path.join(instancePath, 'venv'))))
    results.push(this.checkPath('Config', path.join(instancePath, 'odoo.conf')))
    results.push(this.checkPath('Log', path.join(instancePath, 'log', 'odoo-server.log')))
    results.push(this.checkPath('Addons', path.join(instancePath, 'addons')))
    results.push(this.checkPath('Sources', path.join(instancePath, 'sources')))

    if (isLinux()) {
      results.push(this.checkPort(port))
    } else {
      results.push({ label: `Puerto ${port}`, status: 'skip', details: 'No verificado en Windows' })
    }

    return results
  }

  fix(instancePath: string, port: number = 8069): { success: boolean; message: string } {
    if (isWindows()) {
      const pgStatus = getPGStatus()
      if (!pgStatus.running) {
        const result = ensurePostgreSQL()
        if (!result.success) return result
      }
    }
    if (!isLinux()) {
      return { success: true, message: 'PostgreSQL verificado en Windows' }
    }

    const fixes: string[] = []

    try {
      execSync(
        `chown -R odoo:odoo ${instancePath} 2>/dev/null; \
         mkdir -p /var/log/odoo && touch /var/log/odoo/odoo.log && chown -R odoo:odoo /var/log/odoo && chmod 0644 /var/log/odoo/odoo.log`,
        { timeout: 10000 }
      )
      fixes.push('permisos corregidos')

      const pythonBin = getVenvPython(path.join(instancePath, 'venv'))
      if (!existsSync(pythonBin)) {
        execSync(`python3 -m venv ${path.join(instancePath, 'venv')}`, { timeout: 30000 })
        fixes.push('virtualenv recreado')
      }

      execSync(`${pythonBin} -m pip install --upgrade pip wheel setuptools 2>/dev/null || true`, { timeout: 60000 })
      fixes.push('pip actualizado')

      const reqFile = path.join(instancePath, 'requirements.txt')
      if (existsSync(reqFile)) {
        execSync(`${pythonBin} -m pip install -r ${reqFile} 2>/dev/null || true`, { timeout: 120000 })
        fixes.push('requirements reinstalados')
      }

      const serviceName = this.getServiceName(instancePath)
      if (serviceName) {
        execSync('systemctl daemon-reload 2>/dev/null || true', { timeout: 5000 })
        execSync(`systemctl enable ${serviceName} 2>/dev/null || true`, { timeout: 5000 })
        fixes.push('systemd recargado')
      }

      return { success: true, message: `Fix aplicado: ${fixes.join(', ')}` }
    } catch (e: any) {
      return { success: false, message: e.message || 'Error al aplicar fix' }
    }
  }

  private checkService(label: string, command: string): DoctorCheck {
    try {
      execSync(command, { timeout: 3000 })
      return { label, status: 'ok' }
    } catch {
      return { label, status: 'fail', details: 'No activo' }
    }
  }

  private checkPath(label: string, path: string): DoctorCheck {
    return {
      label,
      status: existsSync(path) ? 'ok' : 'fail',
      details: existsSync(path) ? undefined : 'No encontrado',
    }
  }

  private checkPort(port: number): DoctorCheck {
    try {
      execSync(`ss -ltn | grep -Eq ":${port}[[:space:]]"`, { timeout: 3000 })
      return { label: `Puerto ${port}`, status: 'ok' }
    } catch {
      return { label: `Puerto ${port}`, status: 'fail', details: 'No escuchando' }
    }
  }

  private getServiceName(instancePath: string): string | null {
    const dirName = path.basename(instancePath)
    if (dirName.startsWith('odoo')) return dirName
    return null
  }
}
