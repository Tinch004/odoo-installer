import { execSync } from 'child_process'
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs'

export interface BackupFile {
  name: string
  path: string
  size: number
  date: string
}

export class BackupManager {
  private getBackupDir(instancePath: string): string {
    return `${instancePath}/backups`
  }

  create(instancePath: string, dbName: string, dbUser: string = 'odoo'): { success: boolean; message: string } {
    try {
      const backupDir = this.getBackupDir(instancePath)
      mkdirSync(backupDir, { recursive: true })
      const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)
      const backupFile = `${backupDir}/${date}.dump`

      execSync(
        `pg_dump --username ${dbUser} --format=custom --file "${backupFile}" ${dbName}`,
        { timeout: 300000 }
      )
      execSync(`chown -R odoo:odoo "${backupDir}" 2>/dev/null || true`, { timeout: 5000 })

      return { success: true, message: `Backup creado: ${backupFile}` }
    } catch (e: any) {
      return { success: false, message: e.message || 'Error al crear backup' }
    }
  }

  list(instancePath: string): BackupFile[] {
    const backupDir = this.getBackupDir(instancePath)
    if (!existsSync(backupDir)) return []

    try {
      const files = readdirSync(backupDir)
        .filter(f => f.endsWith('.dump'))
        .map(name => {
          const stat = require('fs').statSync(`${backupDir}/${name}`)
          return {
            name,
            path: `${backupDir}/${name}`,
            size: stat.size,
            date: stat.mtime.toISOString(),
          }
        })
        .sort((a: BackupFile, b: BackupFile) => b.date.localeCompare(a.date))
      return files
    } catch {
      return []
    }
  }

  restore(
    backupPath: string,
    dbName: string,
    dbUser: string = 'odoo',
    instancePath: string
  ): { success: boolean; message: string } {
    try {
      execSync(
        `su - postgres -c "psql -c \\"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${dbName}' AND pid <> pg_backend_pid();\\"" 2>/dev/null || true`,
        { timeout: 10000 }
      )
      execSync(
        `su - postgres -c "dropdb --if-exists ${dbName}"`,
        { timeout: 10000 }
      )
      execSync(
        `su - postgres -c "createdb --owner=${dbUser} ${dbName}"`,
        { timeout: 10000 }
      )
      execSync(
        `pg_restore --username ${dbUser} --dbname ${dbName} "${backupPath}"`,
        { timeout: 300000 }
      )

      // Restart odoo service after restore
      const serviceName = this.getServiceName(instancePath)
      if (serviceName) {
        execSync(`systemctl restart ${serviceName} 2>/dev/null || true`, { timeout: 10000 })
      }

      return { success: true, message: 'Base de datos restaurada correctamente' }
    } catch (e: any) {
      return { success: false, message: e.message || 'Error al restaurar backup' }
    }
  }

  schedule(frequency: 'daily' | 'weekly' | 'monthly'): { success: boolean; message: string } {
    try {
      const cronMap = {
        daily: '0 2 * * *',
        weekly: '0 2 * * 0',
        monthly: '0 2 1 * *',
      }
      const cronSchedule = cronMap[frequency]
      const cronLine = `${cronSchedule} root /usr/local/bin/odoo backup >> /var/log/odoo/backup.log 2>&1\n`

      // Remove existing odoo-backup cron entry, then add new one
      execSync(
        `bash -c 'cat /etc/cron.d/odoo-backup 2>/dev/null | grep -v odoo-backup > /tmp/odoo-cron 2>/dev/null; printf "%s" "${cronLine}" >> /tmp/odoo-cron; install -m 0644 /tmp/odoo-cron /etc/cron.d/odoo-backup; rm -f /tmp/odoo-cron'`,
        { timeout: 5000 }
      )

      return { success: true, message: `Backup automático configurado: ${frequency}` }
    } catch (e: any) {
      return { success: false, message: e.message || 'Error al programar backup' }
    }
  }

  clean(instancePath: string, days: number = 30): { success: boolean; message: string } {
    try {
      const backupDir = this.getBackupDir(instancePath)
      if (!existsSync(backupDir)) return { success: true, message: 'No hay backups para limpiar' }

      execSync(
        `find "${backupDir}" -maxdepth 1 -type f -name '*.dump' -mtime +${days} -delete`,
        { timeout: 10000 }
      )
      return { success: true, message: `Backups anteriores a ${days} días eliminados` }
    } catch (e: any) {
      return { success: false, message: e.message || 'Error al limpiar backups' }
    }
  }

  private getServiceName(instancePath: string): string | null {
    const dirName = instancePath.split('/').pop() || ''
    if (dirName.startsWith('odoo')) return dirName
    return null
  }
}
