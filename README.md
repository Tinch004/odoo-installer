# Odoo Manager Desktop

> GUI de escritorio para gestionar instancias Odoo — servicios, módulos, backups, red y más.

Construido con **Electron**, **React 19**, **TypeScript**, **Vite** y **Tailwind CSS**.

---

## Requisitos

- Node.js 20+
- npm 10+
- Sistema Linux con systemd
- PostgreSQL con peer auth para usuario `odoo`
- `pkexec` o `sudo` para operaciones de servicio

## Instalación

```bash
git clone https://github.com/Tinch004/odoo-installer.git -b desktop
cd odoo-installer
npm install
```

## Desarrollo

```bash
npm run dev
```

Inicia Vite (hot-reload) y Electron. No requiere build previo.

## Build de producción

```bash
npm run build
```

Compila main, preload y renderer en `dist/`.

## Build AppImage

```bash
npm run dist:linux
```

Genera el AppImage portable en `release/`.

## Uso

Ejecutar desde el build de producción:

```bash
npm start
```

O directamente el AppImage:

```bash
./release/Odoo\ Manager-*.AppImage
```

## Funcionalidades

| Sección | Descripción |
|---------|-------------|
| **Dashboard** | Resumen de instancias Odoo detectadas |
| **Services** | Iniciar/detener/reiniciar servicios systemd |
| **Modules** | Gestionar módulos vía JSON-RPC |
| **Store** | Buscar e instalar módulos OCA desde GitHub |
| **Versions** | Instalar nuevas versiones de Odoo desde el source |
| **Backup** | Crear/restaurar/programar backups de PostgreSQL |
| **Network** | Configurar Nginx, SSL Let's Encrypt y Cloudflare Tunnel |
| **Doctor** | Diagnosticar y reparar la instalación |
| **Settings** | Configurar conexión Odoo RPC |

## Estructura del proyecto

```
src/
├── main/          # Proceso principal de Electron
│   ├── index.ts           # Entry point e IPC handlers
│   ├── service-manager.ts # Control de servicios systemd
│   ├── odoo-rpc.ts       # Cliente JSON-RPC para Odoo
│   ├── module-installer.ts # Instalación drag & drop + OCA
│   ├── version-installer.ts # Instalador de versiones Odoo
│   ├── nginx-manager.ts   # Proxy reverso Nginx
│   ├── ssl-manager.ts     # Certificados Let's Encrypt
│   ├── backup-manager.ts  # Backup/restore PostgreSQL
│   ├── tunnel-manager.ts  # Cloudflare Tunnel
│   └── system-doctor.ts   # Diagnóstico y reparación
├── preload/       # Bridge de comunicación seguro
└── renderer/      # UI con React + Tailwind
    ├── App.tsx
    ├── pages/     # Páginas del dashboard
    └── components/ # Componentes compartidos
```

## Licencia

MIT
