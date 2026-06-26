import { execSync } from 'child_process'

export class SSLManager {
  install(domain: string): { success: boolean; message: string } {
    try {
      const hasCertbot = execSync('which certbot 2>/dev/null || true', { encoding: 'utf8', timeout: 3000 }).trim()
      if (!hasCertbot) {
        execSync('apt-get update -y 2>/dev/null', { timeout: 60000 })
        execSync('apt-get install -y snapd 2>/dev/null', { timeout: 60000 })
        execSync('snap install core && snap refresh core', { timeout: 60000 })
        execSync('snap install --classic certbot', { timeout: 60000 })
        execSync('ln -sf /snap/bin/certbot /usr/local/bin/certbot', { timeout: 5000 })
      }
      execSync(
        `certbot --nginx -d ${domain} --non-interactive --agree-tos --redirect --register-unsafely-without-email`,
        { timeout: 120000 }
      )
      return { success: true, message: `SSL configurado para https://${domain}` }
    } catch (e: any) {
      return { success: false, message: e.message || 'Error al instalar SSL' }
    }
  }

  renew(): { success: boolean; message: string } {
    try {
      execSync('certbot renew', { timeout: 60000 })
      return { success: true, message: 'Certificados renovados' }
    } catch (e: any) {
      return { success: false, message: e.message || 'Error al renovar SSL' }
    }
  }

  status(): { success: boolean; message: string } {
    try {
      const out = execSync('certbot certificates 2>&1', { encoding: 'utf8', timeout: 10000 })
      return { success: true, message: out }
    } catch (e: any) {
      return { success: false, message: e.message || 'No hay certificados SSL' }
    }
  }

  isConfigured(): boolean {
    try {
      const out = execSync('certbot certificates 2>&1', { encoding: 'utf8', timeout: 5000 })
      return out.includes('Certificate Name:')
    } catch {
      return false
    }
  }
}
