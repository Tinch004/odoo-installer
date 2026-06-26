import React, { useEffect, useState, useCallback } from 'react'
import { Server, Database, Package, Activity, RefreshCw, Play, Square, AlertCircle, CheckCircle2, FolderOpen, Wrench, Terminal, Database as DatabaseIcon } from 'lucide-react'
import type { DetectedOdoo, ActionResult } from '../types'

const API = window.electronAPI

function statusIcon(status: DetectedOdoo['status']) {
  switch (status) {
    case 'complete': return <CheckCircle2 size={14} className="text-green-400" />
    case 'partial': return <Wrench size={14} className="text-amber-400" />
    case 'cloned': return <FolderOpen size={14} className="text-blue-400" />
  }
}

function statusLabel(status: DetectedOdoo['status']) {
  switch (status) {
    case 'complete': return 'Complete'
    case 'partial': return 'Partial'
    case 'cloned': return 'Cloned'
  }
}

export default function Dashboard() {
  const [instances, setInstances] = useState<DetectedOdoo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [settingUp, setSettingUp] = useState<string | null>(null)
  const [setupResult, setSetupResult] = useState<{ path: string; type: 'success' | 'error'; text: string } | null>(null)
  const [pythonInfo, setPythonInfo] = useState<{ installed: boolean; path: string; version: string } | null>(null)
  const [pgStatus, setPgStatus] = useState<{ installed: boolean; version: string | null; running: boolean; path: string | null } | null>(null)

  const showSetupMsg = (path: string, type: 'success' | 'error', text: string) => {
    setSetupResult({ path, type, text })
    setTimeout(() => setSetupResult(null), 5000)
  }

  const loadInstances = useCallback(async () => {
    try {
      setLoading(true)
      const result = await API.detectAllOdoo()
      setInstances(result)
      setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadInstances()
    API.getPythonInfo().then(setPythonInfo)
    API.getPGStatus().then(setPgStatus)
  }, [loadInstances])

  const doSetup = async (inst: DetectedOdoo) => {
    setSettingUp(inst.path)
    const result = await API.setupOdoo(inst.path)
    showSetupMsg(inst.path, result.success ? 'success' : 'error', result.message)
    setSettingUp(null)
    loadInstances()
    if (result.success) {
      const portMatch = result.message.match(/port (\d+)/)
      if (portMatch) API.openBrowser(`http://localhost:${portMatch[1]}`)
    }
  }

  const completeCount = instances.filter(i => i.status === 'complete').length
  const ports = instances.filter(i => i.port).map(i => i.port).join(', ')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Odoo instances overview</p>
        </div>
        <button
          onClick={loadInstances}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Scan Now
        </button>
      </div>

      {/* Python status */}
      {pythonInfo && !pythonInfo.installed && (
        <div className="glass rounded-xl p-4 mb-4 border border-amber-500/20">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Terminal size={18} className="text-amber-400" />
            </div>
            <div>
              <div className="text-sm font-semibold text-amber-400">Python no encontrado</div>
              <p className="text-xs text-gray-500 mt-0.5">
                No se detectó Python en tu sistema. Instala
                Python desde <a href="https://python.org/downloads" target="_blank" rel="noreferrer" className="text-indigo-400 underline">python.org/downloads</a>
                {' '}o desde la Microsoft Store para crear entornos virtuales Odoo.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <Server size={18} className="text-indigo-400" />
            </div>
            <span className="text-xs font-medium text-gray-500">Detected</span>
          </div>
          <div className="text-2xl font-bold">{instances.length}</div>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 size={18} className="text-green-400" />
            </div>
            <span className="text-xs font-medium text-gray-500">Complete</span>
          </div>
          <div className="text-2xl font-bold text-green-400">{completeCount}</div>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Database size={18} className="text-blue-400" />
            </div>
            <span className="text-xs font-medium text-gray-500">Ports</span>
          </div>
          <div className="text-sm font-medium text-blue-400">{ports || 'None'}</div>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
              pythonInfo?.installed ? 'bg-green-500/10' : 'bg-red-500/10'
            }`}>
              <Terminal size={18} className={pythonInfo?.installed ? 'text-green-400' : 'text-red-400'} />
            </div>
            <span className="text-xs font-medium text-gray-500">Python</span>
          </div>
          <div className={`text-sm font-medium ${pythonInfo?.installed ? 'text-green-400' : 'text-red-400'}`}>
            {pythonInfo?.installed ? pythonInfo.version.split(' ').slice(0, 2).join(' ') || 'OK' : 'No detectado'}
          </div>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
              pgStatus?.running ? 'bg-green-500/10' : pgStatus?.installed ? 'bg-amber-500/10' : 'bg-red-500/10'
            }`}>
              <DatabaseIcon size={18} className={pgStatus?.running ? 'text-green-400' : pgStatus?.installed ? 'text-amber-400' : 'text-red-400'} />
            </div>
            <span className="text-xs font-medium text-gray-500">PostgreSQL</span>
          </div>
          <div className={`text-sm font-medium ${pgStatus?.running ? 'text-green-400' : pgStatus?.installed ? 'text-amber-400' : 'text-red-400'}`}>
            {pgStatus?.running ? `Running v${pgStatus.version || ''}` : pgStatus?.installed ? 'Detenido' : pgStatus === null ? 'Verificando...' : 'No instalado'}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="glass rounded-xl p-4 border border-red-500/20 mb-4">
          <div className="flex items-center gap-2 text-red-400">
            <AlertCircle size={16} />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      {/* Setup result */}
      {setupResult && (
        <div className={`glass rounded-xl p-3 mb-4 flex items-center gap-2 text-sm ${
          setupResult.type === 'success' ? 'border border-green-500/20 text-green-400' : 'border border-red-500/20 text-red-400'
        }`}>
          {setupResult.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {setupResult.text}
        </div>
      )}

      {/* Instances */}
      <h2 className="text-lg font-semibold mb-3">Detected Instances</h2>
      <div className="space-y-3">
        {instances.map(inst => (
          <div key={inst.path} className="glass rounded-xl p-4 card-hover">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full status-pulse ${
                  inst.status === 'complete' ? 'bg-green-400' :
                  inst.status === 'partial' ? 'bg-amber-400' : 'bg-blue-400'
                }`} />
                <div>
                  <div className="font-semibold flex items-center gap-2">
                    Odoo {inst.version}
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-500">
                      {statusIcon(inst.status)} {statusLabel(inst.status)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 font-mono">{inst.path}</div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                {inst.pythonVersion && (
                  <span className="px-2 py-1 rounded-full bg-blue-500/10 text-blue-400">
                    Python {inst.pythonVersion}
                  </span>
                )}
                {inst.port && <span>Port {inst.port}</span>}
                <div className="flex gap-1 items-center">
                  <span className={`px-2 py-1 rounded-full ${
                    inst.hasOdooBin ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                  }`}>bin</span>
                  <span className={`px-2 py-1 rounded-full ${
                    inst.hasConfig ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                  }`}>cfg</span>
                  <span className={`px-2 py-1 rounded-full ${
                    inst.hasVenv ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                  }`}>venv</span>
                  {inst.status !== 'complete' && (
                    <button
                      onClick={() => doSetup(inst)}
                      disabled={settingUp === inst.path}
                      className="ml-2 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {settingUp === inst.path ? (
                        <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Setting up...</>
                      ) : (
                        <><Play size={12} /> Complete & Run</>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
        {!loading && instances.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Server size={32} className="mx-auto mb-2 opacity-50" />
            <p>No Odoo instances detected</p>
            <p className="text-xs mt-1">Go to Versions to install one, or configure the projects directory in Settings</p>
          </div>
        )}
        {loading && (
          <div className="text-center py-12 text-gray-500">
            <RefreshCw size={24} className="mx-auto mb-2 animate-spin" />
            <p>Scanning for Odoo instances...</p>
          </div>
        )}
      </div>
    </div>
  )
}
