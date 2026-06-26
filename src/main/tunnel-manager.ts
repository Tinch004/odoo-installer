import { execSync } from 'child_process'
import { existsSync, writeFileSync, mkdirSync } from 'fs'

const CLOUDFLARED_BIN = '/usr/bin/cloudflared'
const CLOUDFLARED_SERVICE_FILE = '/etc/systemd/system/cloudflared-odoo.service'
const CLOUDFLARED_CONFIG_DIR = '/etc/cloudflared'
const CLOUDFLARED_CONFIG_FILE = '/etc/cloudflared/config.yml'

export class TunnelManager {
  installNamed(domain: string, subdomain: string = 'odoo', port: number = 8069): { success: boolean; message: string } {
    try {
      const hostname = `${subdomain}.${domain}`
      this.ensureCloudflared()

      execSync('cloudflared tunnel login 2>&1', { timeout: 120000 })

      const tunnelId = execSync(
        `cloudflared tunnel list --name odoo --output json 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0].get('id','') if d else '')"`,
        { encoding: 'utf8', timeout: 5000 }
      ).trim()

      let actualTunnelId = tunnelId
      if (!actualTunnelId) {
        const output = execSync('cloudflared tunnel create odoo 2>&1', { encoding: 'utf8', timeout: 30000 })
        const match = output.match(/[0-9a-fA-F-]{36}/)
        if (match) actualTunnelId = match[0]
      }

      if (!actualTunnelId) {
        return { success: false, message: 'No se pudo obtener el ID del tunnel' }
      }

      const config = `tunnel: ${actualTunnelId}
credentials-file: /root/.cloudflared/${actualTunnelId}.json

ingress:
  - hostname: ${hostname}
    service: http://localhost:${port}
  - service: http_status:404
`
      mkdirSync(CLOUDFLARED_CONFIG_DIR, { recursive: true })
      writeFileSync(CLOUDFLARED_CONFIG_FILE, config)

      const service = `[Unit]
Description=Cloudflare Tunnel for Odoo
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${CLOUDFLARED_BIN} --config ${CLOUDFLARED_CONFIG_FILE} tunnel run
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`
      writeFileSync(CLOUDFLARED_SERVICE_FILE, service)
      execSync('systemctl daemon-reload', { timeout: 5000 })
      execSync('systemctl enable cloudflared-odoo', { timeout: 5000 })
      execSync('systemctl restart cloudflared-odoo', { timeout: 10000 })

      execSync(`cloudflared tunnel route dns odoo ${hostname} 2>&1`, { timeout: 15000 })

      return { success: true, message: `Cloudflare Tunnel configurado: https://${hostname}` }
    } catch (e: any) {
      return { success: false, message: e.message || 'Error al instalar Cloudflare Tunnel' }
    }
  }

  installQuick(port: number = 8069): { success: boolean; message: string } {
    try {
      this.ensureCloudflared()

      const service = `[Unit]
Description=Cloudflare Tunnel for Odoo (Quick)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${CLOUDFLARED_BIN} tunnel --url http://localhost:${port}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`
      writeFileSync(CLOUDFLARED_SERVICE_FILE, service)
      execSync('systemctl daemon-reload', { timeout: 5000 })
      execSync('systemctl enable cloudflared-odoo', { timeout: 5000 })
      execSync('systemctl restart cloudflared-odoo', { timeout: 10000 })

      return { success: true, message: 'Cloudflare Tunnel iniciado (URL temporal). Usa "tunnel url" para obtener la URL.' }
    } catch (e: any) {
      return { success: false, message: e.message || 'Error al instalar Cloudflare Tunnel rápido' }
    }
  }

  start(): { success: boolean; message: string } {
    try {
      execSync('systemctl start cloudflared-odoo', { timeout: 10000 })
      return { success: true, message: 'Tunnel iniciado' }
    } catch (e: any) {
      return { success: false, message: e.message || 'Error al iniciar tunnel' }
    }
  }

  stop(): { success: boolean; message: string } {
    try {
      execSync('systemctl stop cloudflared-odoo', { timeout: 10000 })
      return { success: true, message: 'Tunnel detenido' }
    } catch (e: any) {
      return { success: false, message: e.message || 'Error al detener tunnel' }
    }
  }

  restart(): { success: boolean; message: string } {
    try {
      execSync('systemctl restart cloudflared-odoo', { timeout: 10000 })
      return { success: true, message: 'Tunnel reiniciado' }
    } catch (e: any) {
      return { success: false, message: e.message || 'Error al reiniciar tunnel' }
    }
  }

  status(): { success: boolean; active: boolean; message: string } {
    try {
      const out = execSync('systemctl is-active cloudflared-odoo 2>&1', { encoding: 'utf8', timeout: 3000 }).trim()
      const active = out === 'active'
      let url = ''
      if (active) {
        url = this.getUrl().message
      }
      return { success: true, active, message: active ? `Activo - ${url}` : 'Inactivo' }
    } catch {
      return { success: false, active: false, message: 'No instalado' }
    }
  }

  getUrl(): { success: boolean; message: string } {
    try {
      const url = execSync(
        `journalctl -u cloudflared-odoo --no-pager 2>/dev/null | grep -oE 'https://[^[:space:]|]+\\.trycloudflare\\.com' | tail -n 1 || true`,
        { encoding: 'utf8', timeout: 5000 }
      ).trim()

      if (url) return { success: true, message: url }

      const namedUrl = execSync(
        `cat ${CLOUDFLARED_CONFIG_FILE} 2>/dev/null | grep hostname | awk '{print $2}' || true`,
        { encoding: 'utf8', timeout: 3000 }
      ).trim()

      if (namedUrl) return { success: true, message: `https://${namedUrl}` }

      return { success: false, message: 'URL no disponible. El tunnel puede estar iniciando.' }
    } catch {
      return { success: false, message: 'No se pudo obtener la URL' }
    }
  }

  isConfigured(): boolean {
    return existsSync(CLOUDFLARED_SERVICE_FILE)
  }

  private ensureCloudflared(): void {
    const hasCloudflared = execSync('which cloudflared 2>/dev/null || true', { encoding: 'utf8', timeout: 3000 }).trim()
    if (hasCloudflared) return

    execSync(
      `curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /tmp/cloudflare.gpg && \
       install -d -m 0755 /usr/share/keyrings && \
       install -m 0644 /tmp/cloudflare.gpg /usr/share/keyrings/cloudflare-main.gpg && \
       echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' > /etc/apt/sources.list.d/cloudflared.list && \
       apt-get update -y && \
       apt-get install -y cloudflared`,
      { timeout: 120000 }
    )
  }
}
