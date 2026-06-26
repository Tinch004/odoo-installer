import os from 'os'
import path from 'path'
import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { getProjectsDir as getConfigProjectsDir } from './config'

export type Platform = 'linux' | 'windows' | 'macos'

export function getPlatform(): Platform {
  const p = process.platform
  if (p === 'win32') return 'windows'
  if (p === 'darwin') return 'macos'
  return 'linux'
}

export function isWindows(): boolean {
  return getPlatform() === 'windows'
}

export function isLinux(): boolean {
  return getPlatform() === 'linux'
}

export function isMacOS(): boolean {
  return getPlatform() === 'macos'
}

export function getProjectsDir(): string {
  return getConfigProjectsDir()
}

export function getOdooDir(version: string): string {
  const dirName = `odoo${version.replace('.', '')}`
  return path.join(getProjectsDir(), dirName)
}

export function getAddonsDir(version: string): string {
  return path.join(getOdooDir(version), 'sources')
}

function findWindowsPython(): string {
  const versions = ['313', '312', '311', '310', '39', '38', '3', '']
  const basePaths = [
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Python') : '',
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Python') : '',
    'C:\\Python',
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files'),
    process.env['PROGRAMFILES(X86)'] ? path.join(process.env['PROGRAMFILES(X86)']) : '',
  ].filter(Boolean)

  for (const ver of versions) {
    const suffix = ver ? `Python${ver}` : 'Python'
    for (const base of basePaths) {
      const candidates = [
        path.join(base, suffix, 'python.exe'),
        ...(ver === '313' || ver === '312' || ver === '311' || ver === '310' || ver === '3'
          ? [path.join(base, suffix, 'python3.exe')]
          : []),
      ]
      for (const c of candidates) {
        if (existsSync(c)) return c
      }
    }
  }

  for (const ver of versions) {
    for (const base of basePaths) {
      const dir = path.join(base, `Python${ver}`)
      if (existsSync(dir)) {
        const entries = ['python.exe', 'python3.exe']
        for (const e of entries) {
          const fp = path.join(dir, e)
          if (existsSync(fp)) return fp
        }
      }
    }
  }

  try {
    return execSync('where python 2>nul', { encoding: 'utf8', timeout: 3000 }).trim().split('\n')[0]
  } catch {}

  try {
    return execSync('where py 2>nul', { encoding: 'utf8', timeout: 3000 }).trim().split('\n')[0]
  } catch {}

  return 'python'
}

let cachedPython: { version: string; cmd: string } | null = null

export function getPythonCommand(version: string): string {
  if (!isWindows()) {
    const mapping: Record<string, string> = {
      '18': 'python3.12', '17': 'python3.11', '16': 'python3.10',
      '15': 'python3.9', '14': 'python3.8',
    }
    const v = parseFloat(version)
    const key = String(Math.floor(v))
    return mapping[key] || 'python3'
  }

  // Check cache first
  if (cachedPython && cachedPython.version === version) {
    return cachedPython.cmd
  }

  const python = findWindowsPython()
  cachedPython = { version, cmd: python }
  return python
}

export function getPythonInfo(): { installed: boolean; path: string; version: string } {
  if (!isWindows()) return { installed: true, path: 'python3', version: 'system' }
  const python = findWindowsPython()
  try {
    const out = execSync(`"${python}" --version 2>&1`, { encoding: 'utf8', timeout: 5000 }).trim()
    return { installed: true, path: python, version: out }
  } catch {
    return { installed: false, path: python, version: 'No detectado' }
  }
}

export function quoteForShell(cmd: string): string {
  if (cmd.includes(' ') || cmd.includes('\\')) {
    return `"${cmd}"`
  }
  return cmd
}

export function getVenvPython(venvDir: string): string {
  if (isWindows()) {
    return path.join(venvDir, 'Scripts', 'python.exe')
  }
  return path.join(venvDir, 'bin', 'python')
}

export function getVenvActivate(venvDir: string): string {
  if (isWindows()) {
    return path.join(venvDir, 'Scripts', 'activate')
  }
  return path.join(venvDir, 'bin', 'activate')
}

export function getPipCommand(venvDir: string): string {
  const python = getVenvPython(venvDir)
  return `"${python}" -m pip`
}

export function notSupportedOnWindows(feature: string): never {
  throw new Error(`${feature} no está soportado en Windows. Usa WSL (Windows Subsystem for Linux) o ejecuta en Linux.`)
}

export function notSupportedOnMacOS(feature: string): never {
  throw new Error(`${feature} no está soportado en macOS.`)
}

export function requireLinux(feature: string): void {
  const p = getPlatform()
  if (p === 'windows') notSupportedOnWindows(feature)
  if (p === 'macos') notSupportedOnMacOS(feature)
}

export function getServiceName(instancePath: string): string | null {
  const dirName = path.basename(instancePath)
  if (dirName.startsWith('odoo')) return dirName
  return null
}
