import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),

  // Services
  listServices: () => ipcRenderer.invoke('services:list'),
  startService: (name: string) => ipcRenderer.invoke('services:start', name),
  stopService: (name: string) => ipcRenderer.invoke('services:stop', name),
  restartService: (name: string) => ipcRenderer.invoke('services:restart', name),
  enableService: (name: string) => ipcRenderer.invoke('services:enable', name),
  disableService: (name: string) => ipcRenderer.invoke('services:disable', name),
  getServiceLogs: (name: string) => ipcRenderer.invoke('services:logs', name),

  // Odoo RPC
  connect: (config: any) => ipcRenderer.invoke('odoo:connect', config),
  listModules: (db: string) => ipcRenderer.invoke('odoo:modules:list', db),
  installModule: (db: string, name: string) => ipcRenderer.invoke('odoo:modules:install', db, name),
  uninstallModule: (db: string, name: string) => ipcRenderer.invoke('odoo:modules:uninstall', db, name),
  upgradeModule: (db: string, name: string) => ipcRenderer.invoke('odoo:modules:upgrade', db, name),

  // Local module install
  installLocal: (db: string, path: string) => ipcRenderer.invoke('modules:install-local', db, path),
  selectFolder: () => ipcRenderer.invoke('modules:select-folder'),

  // Store
  searchStore: (query: string, version: string) => ipcRenderer.invoke('store:search', query, version),
  installFromStore: (db: string, url: string, version: string) => ipcRenderer.invoke('store:install', db, url, version),

  // Versions
  listAvailableVersions: () => ipcRenderer.invoke('versions:list-available'),
  installVersion: (version: string) => ipcRenderer.invoke('versions:install', version),
  detectLocalVersions: () => ipcRenderer.invoke('versions:detect-local'),

  // Nginx
  nginxStatus: () => ipcRenderer.invoke('nginx:status'),
  nginxIsConfigured: (name?: string) => ipcRenderer.invoke('nginx:is-configured', name),
  nginxInstall: (domain: string, port?: number, name?: string) => ipcRenderer.invoke('nginx:install', domain, port, name),
  nginxUninstall: (name?: string) => ipcRenderer.invoke('nginx:uninstall', name),
  nginxRestart: () => ipcRenderer.invoke('nginx:restart'),

  // SSL
  sslStatus: () => ipcRenderer.invoke('ssl:status'),
  sslIsConfigured: () => ipcRenderer.invoke('ssl:is-configured'),
  sslInstall: (domain: string) => ipcRenderer.invoke('ssl:install', domain),
  sslRenew: () => ipcRenderer.invoke('ssl:renew'),

  // Backup
  backupCreate: (instancePath: string, dbName: string, dbUser?: string) => ipcRenderer.invoke('backup:create', instancePath, dbName, dbUser),
  backupList: (instancePath: string) => ipcRenderer.invoke('backup:list', instancePath),
  backupRestore: (backupPath: string, dbName: string, dbUser: string, instancePath: string) => ipcRenderer.invoke('backup:restore', backupPath, dbName, dbUser, instancePath),
  backupSchedule: (frequency: 'daily' | 'weekly' | 'monthly') => ipcRenderer.invoke('backup:schedule', frequency),
  backupClean: (instancePath: string, days?: number) => ipcRenderer.invoke('backup:clean', instancePath, days),

  // Tunnel
  tunnelStatus: () => ipcRenderer.invoke('tunnel:status'),
  tunnelIsConfigured: () => ipcRenderer.invoke('tunnel:is-configured'),
  tunnelInstallNamed: (domain: string, subdomain?: string, port?: number) => ipcRenderer.invoke('tunnel:install-named', domain, subdomain, port),
  tunnelInstallQuick: (port?: number) => ipcRenderer.invoke('tunnel:install-quick', port),
  tunnelStart: () => ipcRenderer.invoke('tunnel:start'),
  tunnelStop: () => ipcRenderer.invoke('tunnel:stop'),
  tunnelRestart: () => ipcRenderer.invoke('tunnel:restart'),
  tunnelUrl: () => ipcRenderer.invoke('tunnel:url'),

  // Doctor
  doctorCheck: (instancePath: string, port?: number) => ipcRenderer.invoke('doctor:check', instancePath, port),
  doctorFix: (instancePath: string, port?: number) => ipcRenderer.invoke('doctor:fix', instancePath, port),
})
