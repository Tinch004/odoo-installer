import React, { useState, useEffect } from 'react'
import { Layers, Download, CheckCircle2, AlertCircle, Server, RefreshCw, ExternalLink } from 'lucide-react'
import type { OdooVersion } from '../types'

const API = window.electronAPI

export default function VersionInstaller() {
  const [available, setAvailable] = useState<OdooVersion[]>([])
  const [localVersions, setLocalVersions] = useState<Array<{ version: string; path: string; hasService: boolean }>>([])
  const [installing, setInstalling] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [projectsDir, setProjectsDir] = useState('')

  const showMsg = (type: 'success' | 'error', text: string) => {
    setActionMsg({ type, text })
    setTimeout(() => setActionMsg(null), 5000)
  }

  useEffect(() => {
    API.listAvailableVersions().then(setAvailable)
    API.detectLocalVersions().then(setLocalVersions)
    API.getProjectsDir().then(setProjectsDir)
  }, [])

  const doInstall = async (version: string) => {
    setInstalling(version)
    const result = await API.installVersion(version)
    showMsg(result.success ? 'success' : 'error', result.message)
    setInstalling(null)
    API.detectLocalVersions().then(setLocalVersions)
  }

  const isInstalled = (version: string) => {
    return localVersions.some(v => v.version === version)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Version Installer</h1>
          <p className="text-gray-500 text-sm mt-1">Install and manage Odoo versions</p>
        </div>
        <button
          onClick={() => API.detectLocalVersions().then(setLocalVersions)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {actionMsg && (
        <div className={`glass rounded-xl p-3 mb-4 flex items-center gap-2 text-sm ${
          actionMsg.type === 'success' ? 'border border-green-500/20 text-green-400' : 'border border-red-500/20 text-red-400'
        }`}>
          {actionMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {actionMsg.text}
        </div>
      )}

      {/* Local installed versions */}
      {localVersions.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Installed Locally</h2>
          <div className="space-y-2">
            {localVersions.map(lv => (
              <div key={lv.version} className="glass rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${lv.hasService ? 'bg-green-400' : 'bg-gray-500'}`} />
                    <div>
                      <div className="font-semibold">Odoo {lv.version}</div>
                      <div className="text-xs text-gray-500">{lv.path}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full ${lv.hasService ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-400'}`}>
                      {lv.hasService ? 'Service Active' : 'No Service'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Install directory info */}
      {projectsDir && (
        <div className="glass rounded-xl p-3 mb-4 flex items-center gap-2 text-xs text-gray-400">
          <Layers size={14} className="text-indigo-400 shrink-0" />
          Instances will be installed in: <span className="text-gray-300 font-mono">{projectsDir}</span>
          <span className="text-gray-600"> (change in Settings)</span>
        </div>
      )}

      {/* Available to install */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Available Versions</h2>
        <div className="grid grid-cols-2 gap-3">
          {available.map(v => (
            <div key={v.version} className={`glass rounded-xl p-5 ${isInstalled(v.version) ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Layers size={18} className="text-indigo-400" />
                    <h3 className="text-lg font-bold">Odoo {v.version}</h3>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
                      Python {v.pythonVersion}
                    </span>
                    <span className="text-xs text-gray-500">
                      Branch: {v.branch}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                    Clones from GitHub, creates venv with Python {v.pythonVersion},
                    configures systemd service and PostgreSQL database.
                  </p>
                </div>
                {isInstalled(v.version) ? (
                  <span className="flex items-center gap-1 text-xs text-green-400 shrink-0">
                    <CheckCircle2 size={14} />
                    Installed
                  </span>
                ) : (
                  <button
                    onClick={() => doInstall(v.version)}
                    disabled={installing === v.version}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors disabled:opacity-50 shrink-0 ml-4"
                  >
                    {installing === v.version ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Installing...
                      </>
                    ) : (
                      <>
                        <Download size={14} />
                        Install
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
