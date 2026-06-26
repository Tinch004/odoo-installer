import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import { ServiceManager } from './service-manager'
import { OdooRPC } from './odoo-rpc'
import { ModuleInstaller } from './module-installer'
import { VersionInstaller } from './version-installer'
import { NginxManager } from './nginx-manager'
import { SSLManager } from './ssl-manager'
import { BackupManager } from './backup-manager'
import { TunnelManager } from './tunnel-manager'
import { SystemDoctor } from './system-doctor'
import { getProjectsDir, setProjectsDir } from './config'
import { detectAllOdoo, setupInstance } from './odo-detector'
import { getPythonInfo } from './platform'
import { getPGStatus, ensurePostgreSQL, resetPGCache } from './postgres'

let mainWindow: BrowserWindow | null = null
const serviceManager = new ServiceManager()
const odooRPC = new OdooRPC()
const moduleInstaller = new ModuleInstaller()
const versionInstaller = new VersionInstaller()
const nginxManager = new NginxManager()
const sslManager = new SSLManager()
const backupManager = new BackupManager()
const tunnelManager = new TunnelManager()
const systemDoctor = new SystemDoctor()

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// IPC Handlers
ipcMain.handle('window:minimize', () => mainWindow?.minimize())
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.handle('window:close', () => mainWindow?.close())

// Service Manager
ipcMain.handle('services:list', () => serviceManager.listServices())
ipcMain.handle('services:start', (_, name) => serviceManager.control(name, 'start'))
ipcMain.handle('services:stop', (_, name) => serviceManager.control(name, 'stop'))
ipcMain.handle('services:restart', (_, name) => serviceManager.control(name, 'restart'))
ipcMain.handle('services:enable', (_, name) => serviceManager.control(name, 'enable'))
ipcMain.handle('services:disable', (_, name) => serviceManager.control(name, 'disable'))
ipcMain.handle('services:logs', (_, name) => serviceManager.getLogs(name))
ipcMain.handle('services:connection-info', () => serviceManager.getConnectionInfo())

// Odoo RPC
ipcMain.handle('odoo:connect', (_, config) => odooRPC.connect(config))
ipcMain.handle('odoo:modules:list', (_, db) => odooRPC.listModules(db))
ipcMain.handle('odoo:modules:install', (_, db, moduleName) => odooRPC.installModule(db, moduleName))
ipcMain.handle('odoo:modules:uninstall', (_, db, moduleName) => odooRPC.uninstallModule(db, moduleName))
ipcMain.handle('odoo:modules:upgrade', (_, db, moduleName) => odooRPC.upgradeModule(db, moduleName))

// Module Installer (drag & drop)
ipcMain.handle('modules:install-local', (_, db, sourcePath) => moduleInstaller.installLocal(db, sourcePath))
ipcMain.handle('modules:select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

// Module Store (OCA)
ipcMain.handle('store:search', (_, query, odooVersion) => moduleInstaller.searchOCA(query, odooVersion))
ipcMain.handle('store:install', (_, db, repoUrl, odooVersion) => moduleInstaller.installFromStore(db, repoUrl, odooVersion))

// Version Installer
ipcMain.handle('versions:list-available', () => versionInstaller.listAvailable())
ipcMain.handle('versions:install', (_, version) => versionInstaller.install(version))
ipcMain.handle('versions:detect-local', () => versionInstaller.detectLocal())

// Nginx Manager
ipcMain.handle('nginx:status', () => nginxManager.status())
ipcMain.handle('nginx:is-configured', (_, name) => nginxManager.isConfigured(name))
ipcMain.handle('nginx:install', (_, domain, port, name) => nginxManager.install(domain, port, name))
ipcMain.handle('nginx:uninstall', (_, name) => nginxManager.uninstall(name))
ipcMain.handle('nginx:restart', () => nginxManager.restart())

// SSL Manager
ipcMain.handle('ssl:status', () => sslManager.status())
ipcMain.handle('ssl:is-configured', () => sslManager.isConfigured())
ipcMain.handle('ssl:install', (_, domain) => sslManager.install(domain))
ipcMain.handle('ssl:renew', () => sslManager.renew())

// Backup Manager
ipcMain.handle('backup:create', (_, instancePath, dbName, dbUser) => backupManager.create(instancePath, dbName, dbUser))
ipcMain.handle('backup:list', (_, instancePath) => backupManager.list(instancePath))
ipcMain.handle('backup:restore', (_, backupPath, dbName, dbUser, instancePath) => backupManager.restore(backupPath, dbName, dbUser, instancePath))
ipcMain.handle('backup:schedule', (_, frequency) => backupManager.schedule(frequency))
ipcMain.handle('backup:clean', (_, instancePath, days) => backupManager.clean(instancePath, days))

// Tunnel Manager
ipcMain.handle('tunnel:status', () => tunnelManager.status())
ipcMain.handle('tunnel:is-configured', () => tunnelManager.isConfigured())
ipcMain.handle('tunnel:install-named', (_, domain, subdomain, port) => tunnelManager.installNamed(domain, subdomain, port))
ipcMain.handle('tunnel:install-quick', (_, port) => tunnelManager.installQuick(port))
ipcMain.handle('tunnel:start', () => tunnelManager.start())
ipcMain.handle('tunnel:stop', () => tunnelManager.stop())
ipcMain.handle('tunnel:restart', () => tunnelManager.restart())
ipcMain.handle('tunnel:url', () => tunnelManager.getUrl())

// System Doctor
ipcMain.handle('doctor:check', (_, instancePath, port) => systemDoctor.check(instancePath, port))
ipcMain.handle('doctor:fix', (_, instancePath, port) => systemDoctor.fix(instancePath, port))

// Odoo Detector
ipcMain.handle('odoo:detect-all', () => detectAllOdoo())
ipcMain.handle('odoo:setup', (_, instancePath) => setupInstance(instancePath))

// Python info
ipcMain.handle('python:info', () => getPythonInfo())

// PostgreSQL
ipcMain.handle('pg:status', () => getPGStatus())
ipcMain.handle('pg:ensure', () => ensurePostgreSQL())
ipcMain.handle('pg:reset-cache', () => resetPGCache())

// Projects Directory
ipcMain.handle('projects:get-dir', () => getProjectsDir())
ipcMain.handle('projects:select-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: 'Select Odoo projects directory',
  })
  if (result.canceled) return null
  const dir = result.filePaths[0]
  setProjectsDir(dir)
  return dir
})
ipcMain.handle('projects:set-dir', (_, dir: string) => {
  setProjectsDir(dir)
  return true
})

// Shell
ipcMain.handle('shell:open-url', (_, url: string) => {
  shell.openExternal(url)
})
