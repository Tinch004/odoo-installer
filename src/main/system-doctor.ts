import { execSync } from 'child_process'
import { existsSync } from 'fs'

export interface DoctorCheck {
  label: string
  status: 'ok' | 'fail' | 'skip'
  details?: string
}

export class SystemDoctor {
  check(instancePath: string, port: number = 8069): DoctorCheck[] {
    const results: DoctorCheck[] = []

    results.push(this.checkService('PostgreSQL', 'systemctl is-active --quiet postgresql'))
    results.push(this.checkService('Odoo service', `systemctl is-active --quiet ${this.getServiceName(instancePath)}`))
    results.push(this.checkPath('Directorio de instalación', instancePath))
    results.push(this.checkPath('Odoo bin', `${instancePath}/odoo-bin`))
    results.push(this.checkPath('Virtualenv', `${instancePath}/venv/bin/python`))
    results.push(this.checkPath('Config', '/etc/odoo.conf'))
    results.push(this.checkPath('Log', '/var/log/odoo/odoo.log'))
    results.push(this.checkPath('Addons', `${instancePath}/addons`))
    results.push(this.checkPath('Sources', `${instancePath}/sources`))
    results.push(this.checkPort(port))

    return results
  }

  fix(instancePath: string, port: number = 8069): { success: boolean; message: string } {
    const fixes: string[] = []

    try {
      // Fix permissions
      execSync(
        `chown -R odoo:odoo ${instancePath} 2>/dev/null; \
         mkdir -p /var/log/odoo && touch /var/log/odoo/odoo.log && chown -R odoo:odoo /var/log/odoo && chmod 0644 /var/log/odoo/odoo.log`,
        { timeout: 10000 }
      )
      fixes.push('permisos corregidos')

      // Fix virtualenv
      const pythonBin = `${instancePath}/venv/bin/python`
      if (!existsSync(pythonBin)) {
        execSync(`python3 -m venv ${instancePath}/venv`, { timeout: 30000 })
        fixes.push('virtualenv recreado')
      }

      // Fix pip
      execSync(`${pythonBin} -m pip install --upgrade pip wheel setuptools 2>/dev/null || true`, { timeout: 60000 })
      fixes.push('pip actualizado')

      // Fix requirements
      const reqFile = `${instancePath}/requirements.txt`
      if (existsSync(reqFile)) {
        execSync(`${pythonBin} -m pip install -r ${reqFile} 2>/dev/null || true`, { timeout: 120000 })
        fixes.push('requirements reinstalados')
      }

      // Fix systemd
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
    const dirName = instancePath.split('/').pop() || ''
    if (dirName.startsWith('odoo')) return dirName
    return null
  }
}
