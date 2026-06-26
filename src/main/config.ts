import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import path from 'path'
import os from 'os'

const DEFAULT_PROJECTS_DIR = path.join(os.homedir(), 'proyectos')

interface AppConfig {
  projectsDir: string
}

let config: AppConfig | null = null
let configPath: string | null = null

function ensureConfigPath(): string {
  if (configPath) return configPath
  const dataDir = process.env.APPDATA
    ? path.join(process.env.APPDATA, 'odoo-manager')
    : path.join(os.homedir(), '.config', 'odoo-manager')
  mkdirSync(dataDir, { recursive: true })
  configPath = path.join(dataDir, 'config.json')
  return configPath
}

function loadConfig(): AppConfig {
  if (config) return config
  const cp = ensureConfigPath()
  try {
    if (existsSync(cp)) {
      const raw = readFileSync(cp, 'utf8')
      config = JSON.parse(raw)
    }
  } catch {}
  if (!config) {
    config = { projectsDir: DEFAULT_PROJECTS_DIR }
  }
  return config
}

function saveConfig(c: AppConfig): void {
  const cp = ensureConfigPath()
  writeFileSync(cp, JSON.stringify(c, null, 2))
  config = c
}

export function getProjectsDir(): string {
  return loadConfig().projectsDir
}

export function setProjectsDir(dir: string): void {
  const c = loadConfig()
  c.projectsDir = dir
  saveConfig(c)
}
