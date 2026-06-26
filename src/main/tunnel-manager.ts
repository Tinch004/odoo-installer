import { execSync } from 'child_process'
import { existsSync, writeFileSync, mkdirSync } from 'fs'
import path from 'path'
import { isLinux, isWindows } from './platform'

const CLOUDFLARED_BIN_LINUX = '/usr/bin/cloudflared'
const CLOUDFLARED_SERVICE_FILE = '/etc/systemd/system/cloudflared-odoo.service'
const CLOUDFLARED_CONFIG_DIR = '/etc/cloudflared'
const CLOUDFLARED_CONFIG_FILE = '/etc/cloudflared/config.yml'

function cloudflaredBin(): string {
  if (isWindows()) {
    const winPaths = [
      path.join(process.env.LOCALAPPDATA || 'C:\\Program Files', 'cloudflared', 'cloudflared.exe'),
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'cloudflared', 'cloudflared.exe'),
      'cloudflared.exe',
    ]
    for (const p of winPaths) {
      try {
        execSync(`"${p}" --version 2>nul`, { timeout: 2000 })
        return p
      } catch {}
    }
    return 'cloudflared.exe'
  }
  return CLOUDFLARED_BIN_LINUX
}

export class TunnelManager {
  installNamed(domain: string, subdomain: string = 'odoo', port: number = 8069): { success: boolean; message: string } {
    try {
      const hostname = `${subdomain}.${domain}`
      this.ensureCloudflared()

      execSync(`${cloudflaredBin()} tunnel login 2>&1`, { timeout: 120000 })

      const tunnelId = execSync(
        `${cloudflaredBin()} tunnel list --name odoo --output json 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0].get('id','') if d else '')"`,
        { encoding: 'utf8', timeout: 5000 }
      ).trim()

      let actualTunnelId = tunnelId
      if (!actualTunnelId) {
        const output = execSync(`${cloudflaredBin()} tunnel create odoo 2>&1`, { encoding: 'utf8', timeout: 30000 })
        const match = output.match(/[0-9a-fA-F-]{36}/)
        if (match) actualTunnelId = match[0]
      }

      if (!actualTunnelId) {
        return { success: false, message: 'No se pudo obtener el ID del tunnel' }
      }

      const credsFile = isWindows()
        ? path.join(process.env.USERPROFILE || 'C:\\Users\\default', '.cloudflared', `${actualTunnelId}.json`)
        : `/root/.cloudflared/${actualTunnelId}.json`

      const config = `tunnel: ${actualTunnelId}
credentials-file: ${credsFile}

ingress:
  - hostname: ${hostname}
    service: http://localhost:${port}
  - service: http_status:404
`
      const configDir = isWindows()
        ? path.join(process.env.USERPROFILE || 'C:\\Users\\default', '.cloudflared')
        : CLOUDFLARED_CONFIG_DIR
      const configFile = path.join(configDir, 'config.yml')

      mkdirSync(configDir, { recursive: true })
      writeFileSync(configFile, config)

      if (isLinux()) {
        const service = `[Unit]
Description=Cloudflare Tunnel for Odoo
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${CLOUDFLARED_BIN_LINUX} --config ${configFile} tunnel run
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`
        writeFileSync(CLOUDFLARED_SERVICE_FILE, service)
        execSync('systemctl daemon-reload', { timeout: 5000 })
        execSync('systemctl enable cloudflared-odoo', { timeout: 5000 })
        execSync('systemctl restart cloudflared-odoo', { timeout: 10000 })
      } else {
        execSync(
          `start "" "${cloudflaredBin()}" --config "${configFile}" tunnel run`,
          { timeout: 5000 }
        )
      }

      execSync(`${cloudflaredBin()} tunnel route dns odoo ${hostname} 2>&1`, { timeout: 15000 })

      return { success: true, message: `Cloudflare Tunnel configurado: https://${hostname}` }
    } catch (e: any) {
      return { success: false, message: e.message || 'Error al instalar Cloudflare Tunnel' }
    }
  }

  installQuick(port: number = 8069): { success: boolean; message: string } {
    try {
      this.ensureCloudflared()

      if (isLinux()) {
        const service = `[Unit]
Description=Cloudflare Tunnel for Odoo (Quick)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${CLOUDFLARED_BIN_LINUX} tunnel --url http://localhost:${port}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`
        writeFileSync(CLOUDFLARED_SERVICE_FILE, service)
        execSync('systemctl daemon-reload', { timeout: 5000 })
        execSync('systemctl enable cloudflared-odoo', { timeout: 5000 })
        execSync('systemctl restart cloudflared-odoo', { timeout: 10000 })
      } else {
        execSync(
          `start "" "${cloudflaredBin()}" tunnel --url http://localhost:${port}`,
          { timeout: 5000 }
        )
      }

      return { success: true, message: 'Cloudflare Tunnel iniciado (URL temporal). Usa "tunnel url" para obtener la URL.' }
    } catch (e: any) {
      return { success: false, message: e.message || 'Error al instalar Cloudflare Tunnel rápido' }
    }
  }

  start(): { success: boolean; message: string } {
    if (!isLinux()) {
      return { success: false, message: 'Iniciar tunnel como servicio solo en Linux. En Windows inicia automáticamente.' }
    }
    try {
      execSync('systemctl start cloudflared-odoo', { timeout: 10000 })
      return { success: true, message: 'Tunnel iniciado' }
    } catch (e: any) {
      return { success: false, message: e.message || 'Error al iniciar tunnel' }
    }
  }

  stop(): { success: boolean; message: string } {
    if (!isLinux()) {
      try {
        execSync(`taskkill /f /im cloudflared.exe 2>nul || true`, { timeout: 5000 })
        return { success: true, message: 'Tunnel detenido' }
      } catch (e: any) {
        return { success: false, message: e.message || 'Error al detener tunnel' }
      }
    }
    try {
      execSync('systemctl stop cloudflared-odoo', { timeout: 10000 })
      return { success: true, message: 'Tunnel detenido' }
    } catch (e: any) {
      return { success: false, message: e.message || 'Error al detener tunnel' }
    }
  }

  restart(): { success: boolean; message: string } {
    this.stop()
    return this.start()
  }

  status(): { success: boolean; active: boolean; message: string } {
    try {
      let active = false
      if (isLinux()) {
        const out = execSync('systemctl is-active cloudflared-odoo 2>&1', { encoding: 'utf8', timeout: 3000 }).trim()
        active = out === 'active'
      } else {
        try {
          execSync('tasklist /fi "imagename eq cloudflared.exe" 2>nul | findstr /i cloudflared', { timeout: 3000 })
          active = true
        } catch {}
      }
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
      let url = ''
      if (isLinux()) {
        url = execSync(
          `journalctl -u cloudflared-odoo --no-pager 2>/dev/null | grep -oE 'https://[^[:space:]|]+\\.trycloudflare\\.com' | tail -n 1 || true`,
          { encoding: 'utf8', timeout: 5000 }
        ).trim()
      }

      if (!url) {
        const configDir = isWindows()
          ? path.join(process.env.USERPROFILE || 'C:\\Users\\default', '.cloudflared')
          : CLOUDFLARED_CONFIG_DIR
        const configFile = path.join(configDir, 'config.yml')
        if (existsSync(configFile)) {
          const raw = require('fs').readFileSync(configFile, 'utf8')
          const m = raw.match(/hostname:\s*(.+)/)
          if (m) url = `https://${m[1].trim()}`
        }
      }

      if (url) return { success: true, message: url }
      return { success: false, message: 'URL no disponible. El tunnel puede estar iniciando.' }
    } catch {
      return { success: false, message: 'No se pudo obtener la URL' }
    }
  }

  isConfigured(): boolean {
    if (isLinux()) return existsSync(CLOUDFLARED_SERVICE_FILE)
    const configDir = path.join(process.env.USERPROFILE || 'C:\\Users\\default', '.cloudflared')
    return existsSync(path.join(configDir, 'config.yml'))
  }

  private ensureCloudflared(): void {
    try {
      execSync(`"${cloudflaredBin()}" --version 2>nul`, { timeout: 3000 })
      return
    } catch {}

    if (isLinux()) {
      execSync(
        `curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /tmp/cloudflare.gpg && \
         install -d -m 0755 /usr/share/keyrings && \
         install -m 0644 /tmp/cloudflare.gpg /usr/share/keyrings/cloudflare-main.gpg && \
         echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' > /etc/apt/sources.list.d/cloudflared.list && \
         apt-get update -y && \
         apt-get install -y cloudflared`,
        { timeout: 120000 }
      )
    } else {
      // Windows: download cloudflared
      const downloadUrl = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
      const destDir = process.env.LOCALAPPDATA || 'C:\\Program Files'
      const destPath = path.join(destDir, 'cloudflared', 'cloudflared.exe')
      mkdirSync(path.dirname(destPath), { recursive: true })
      execSync(
        `powershell -Command "Invoke-WebRequest -Uri '${downloadUrl}' -OutFile '${destPath}'"`,
        { timeout: 60000 }
      )
    }
  }
}
