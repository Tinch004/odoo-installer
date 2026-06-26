import { execSync } from 'child_process'
import { existsSync, writeFileSync, unlinkSync, mkdirSync } from 'fs'

const NGINX_AVAILABLE_DIR = '/etc/nginx/sites-available'
const NGINX_ENABLED_DIR = '/etc/nginx/sites-enabled'

export class NginxManager {
  isConfigured(name: string = 'odoo'): boolean {
    return existsSync(`${NGINX_AVAILABLE_DIR}/${name}`) && existsSync(`${NGINX_ENABLED_DIR}/${name}`)
  }

  install(domain: string, port: number, name: string = 'odoo'): { success: boolean; message: string } {
    try {
      const siteConfig = `server {
    listen 80;
    server_name ${domain};

    proxy_read_timeout 720s;
    proxy_connect_timeout 720s;
    proxy_send_timeout 720s;

    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Real-IP $remote_addr;

    location / {
        proxy_redirect off;
        proxy_pass http://127.0.0.1:${port};
    }
}
`
      execSync('apt-get install -y nginx 2>/dev/null', { timeout: 60000 })
      mkdirSync(NGINX_AVAILABLE_DIR, { recursive: true })
      mkdirSync(NGINX_ENABLED_DIR, { recursive: true })
      writeFileSync(`${NGINX_AVAILABLE_DIR}/${name}`, siteConfig)

      execSync(`ln -sf ${NGINX_AVAILABLE_DIR}/${name} ${NGINX_ENABLED_DIR}/${name}`, { timeout: 5000 })
      execSync('nginx -t', { timeout: 5000 })
      execSync('systemctl restart nginx', { timeout: 10000 })

      return { success: true, message: `Nginx configurado para http://${domain}` }
    } catch (e: any) {
      return { success: false, message: e.message || 'Error al instalar Nginx' }
    }
  }

  uninstall(name: string = 'odoo'): { success: boolean; message: string } {
    try {
      if (existsSync(`${NGINX_ENABLED_DIR}/${name}`)) {
        unlinkSync(`${NGINX_ENABLED_DIR}/${name}`)
      }
      if (existsSync(`${NGINX_AVAILABLE_DIR}/${name}`)) {
        unlinkSync(`${NGINX_AVAILABLE_DIR}/${name}`)
      }
      execSync('systemctl restart nginx 2>/dev/null || true', { timeout: 10000 })
      return { success: true, message: 'Configuración Nginx eliminada' }
    } catch (e: any) {
      return { success: false, message: e.message || 'Error al desinstalar Nginx' }
    }
  }

  restart(): { success: boolean; message: string } {
    try {
      execSync('systemctl restart nginx', { timeout: 10000 })
      return { success: true, message: 'Nginx reiniciado' }
    } catch (e: any) {
      return { success: false, message: e.message || 'Error al reiniciar Nginx' }
    }
  }

  status(): { active: boolean; message: string } {
    try {
      const out = execSync('systemctl is-active nginx', { encoding: 'utf8', timeout: 3000 }).trim()
      return { active: out === 'active', message: out }
    } catch {
      return { active: false, message: 'inactivo' }
    }
  }
}
