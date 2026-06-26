export interface ServiceInfo {
  name: string
  version: string
  port: number
  status: 'running' | 'stopped' | 'error'
  enabled: boolean
  pid: number | null
  memory: string
  configFile: string
  addonsPaths: string[]
  dbUser: string
  dbHost: string
  dbPort: number
  logFile: string
}

export interface ModuleInfo {
  id: number
  name: string
  display_name: string
  state: 'installed' | 'uninstalled' | 'to install' | 'to upgrade' | 'to remove'
  category: string
  version: string
  summary: string
  author: string
  website: string
  license: string
  application: boolean
  depends: string[]
  auto_install: boolean
}

export interface OCAModule {
  name: string
  repo: string
  url: string
  description: string
  category: string
  license: string
  stars: number
  updated: string
  compatibleVersions: string[]
}

export interface OdooVersion {
  version: string
  branch: string
  pythonVersion: string
  supported: boolean
}

export interface BackupFile {
  name: string
  path: string
  size: number
  date: string
}

export interface DoctorCheck {
  label: string
  status: 'ok' | 'fail' | 'skip'
  details?: string
}

export interface DetectedOdoo {
  version: string
  path: string
  hasConfig: boolean
  hasOdooBin: boolean
  hasVenv: boolean
  hasService: boolean
  status: 'complete' | 'partial' | 'cloned'
  pythonVersion: string
  port: number | null
}

export interface ConnectionInfo {
  host: string
  port: number
  db: string
  username: string
  password: string
  instanceName: string
  logFile: string
}

export interface ActionResult {
  success: boolean
  message: string
}

declare global {
  interface Window {
    electronAPI: {
      minimize: () => Promise<void>
      maximize: () => Promise<void>
      close: () => Promise<void>
      listServices: () => Promise<ServiceInfo[]>
      startService: (name: string) => Promise<ActionResult>
      stopService: (name: string) => Promise<ActionResult>
      restartService: (name: string) => Promise<ActionResult>
      enableService: (name: string) => Promise<ActionResult>
      disableService: (name: string) => Promise<ActionResult>
      getServiceLogs: (name: string) => Promise<string>
      getConnectionInfo: () => Promise<ConnectionInfo | null>
      connect: (config: any) => Promise<boolean>
      listModules: (db: string) => Promise<ModuleInfo[]>
      installModule: (db: string, name: string) => Promise<boolean>
      uninstallModule: (db: string, name: string) => Promise<boolean>
      upgradeModule: (db: string, name: string) => Promise<boolean>
      installLocal: (db: string, path: string) => Promise<ActionResult>
      selectFolder: () => Promise<string | null>
      searchStore: (query: string, version: string) => Promise<OCAModule[]>
      installFromStore: (db: string, url: string, version: string) => Promise<ActionResult>
      listAvailableVersions: () => Promise<OdooVersion[]>
      installVersion: (version: string) => Promise<ActionResult>
      detectLocalVersions: () => Promise<Array<{ version: string; path: string; hasService: boolean }>>
      nginxStatus: () => Promise<{ active: boolean; message: string }>
      nginxIsConfigured: (name?: string) => Promise<boolean>
      nginxInstall: (domain: string, port?: number, name?: string) => Promise<ActionResult>
      nginxUninstall: (name?: string) => Promise<ActionResult>
      nginxRestart: () => Promise<ActionResult>
      sslStatus: () => Promise<ActionResult>
      sslIsConfigured: () => Promise<boolean>
      sslInstall: (domain: string) => Promise<ActionResult>
      sslRenew: () => Promise<ActionResult>
      backupCreate: (instancePath: string, dbName: string, dbUser?: string) => Promise<ActionResult>
      backupList: (instancePath: string) => Promise<BackupFile[]>
      backupRestore: (backupPath: string, dbName: string, dbUser: string, instancePath: string) => Promise<ActionResult>
      backupSchedule: (frequency: 'daily' | 'weekly' | 'monthly') => Promise<ActionResult>
      backupClean: (instancePath: string, days?: number) => Promise<ActionResult>
      tunnelStatus: () => Promise<{ success: boolean; active: boolean; message: string }>
      tunnelIsConfigured: () => Promise<boolean>
      tunnelInstallNamed: (domain: string, subdomain?: string, port?: number) => Promise<ActionResult>
      tunnelInstallQuick: (port?: number) => Promise<ActionResult>
      tunnelStart: () => Promise<ActionResult>
      tunnelStop: () => Promise<ActionResult>
      tunnelRestart: () => Promise<ActionResult>
      tunnelUrl: () => Promise<ActionResult>
      doctorCheck: (instancePath: string, port?: number) => Promise<DoctorCheck[]>
      doctorFix: (instancePath: string, port?: number) => Promise<ActionResult>

      // Odoo Detector
      detectAllOdoo: () => Promise<DetectedOdoo[]>
      setupOdoo: (instancePath: string) => Promise<ActionResult>

      // Python
      getPythonInfo: () => Promise<{ installed: boolean; path: string; version: string }>

      // PostgreSQL
      getPGStatus: () => Promise<{ installed: boolean; version: string | null; running: boolean; path: string | null }>
      ensurePG: () => Promise<ActionResult>
      resetPGCache: () => Promise<void>

      // Shell
      openBrowser: (url: string) => Promise<void>

      // Projects Directory
      getProjectsDir: () => Promise<string>
      selectProjectsDir: () => Promise<string | null>
      setProjectsDir: (dir: string) => Promise<boolean>
    }
  }
}
