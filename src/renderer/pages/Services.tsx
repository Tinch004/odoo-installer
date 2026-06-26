import React, { useEffect, useState } from 'react'
import { Play, Square, RefreshCw, Power, PowerOff, FileText, AlertCircle, CheckCircle2 } from 'lucide-react'
import type { ServiceInfo } from '../types'

const API = window.electronAPI

export default function Services() {
  const [services, setServices] = useState<ServiceInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState<string>('')
  const [selectedService, setSelectedService] = useState<string | null>(null)
  const [actionResult, setActionResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const load = async () => {
    setLoading(true)
    const svcs = await API.listServices()
    setServices(svcs)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const doAction = async (name: string, action: 'start' | 'stop' | 'restart' | 'enable' | 'disable') => {
    const fn = action === 'start' ? API.startService :
               action === 'stop' ? API.stopService :
               action === 'restart' ? API.restartService :
               action === 'enable' ? API.enableService : API.disableService
    const result = await fn(name)
    setActionResult({ type: result.success ? 'success' : 'error', message: result.message })
    setTimeout(() => setActionResult(null), 3000)
    load()
  }

  const viewLogs = async (name: string) => {
    setSelectedService(name)
    const logData = await API.getServiceLogs(name)
    setLogs(logData)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Services</h1>
          <p className="text-gray-500 text-sm mt-1">Manage Odoo systemd services</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {actionResult && (
        <div className={`glass rounded-xl p-3 mb-4 flex items-center gap-2 text-sm ${
          actionResult.type === 'success' ? 'border border-green-500/20 text-green-400' : 'border border-red-500/20 text-red-400'
        }`}>
          {actionResult.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {actionResult.message}
        </div>
      )}

      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Service</th>
              <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Version</th>
              <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Port</th>
              <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Memory</th>
              <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Logs</th>
            </tr>
          </thead>
          <tbody>
            {services.map(svc => (
              <tr key={svc.name} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                <td className="p-4">
                  <span className="font-medium">{svc.name}</span>
                </td>
                <td className="p-4 text-sm text-gray-400">{svc.version}</td>
                <td className="p-4">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                    svc.status === 'running' ? 'bg-green-500/10 text-green-400' :
                    svc.status === 'stopped' ? 'bg-gray-500/10 text-gray-400' : 'bg-red-500/10 text-red-400'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      svc.status === 'running' ? 'bg-green-400' :
                      svc.status === 'stopped' ? 'bg-gray-500' : 'bg-red-400'
                    }`} />
                    {svc.status}
                  </span>
                </td>
                <td className="p-4 text-sm text-gray-400">{svc.port}</td>
                <td className="p-4 text-sm text-gray-400">{svc.memory}</td>
                <td className="p-4">
                  <div className="flex gap-1">
                    <button onClick={() => doAction(svc.name, 'start')} disabled={svc.status === 'running'}
                      className="p-1.5 rounded bg-green-500/10 hover:bg-green-500/20 text-green-400 disabled:opacity-30 transition-colors">
                      <Play size={12} />
                    </button>
                    <button onClick={() => doAction(svc.name, 'stop')} disabled={svc.status !== 'running'}
                      className="p-1.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 disabled:opacity-30 transition-colors">
                      <Square size={12} />
                    </button>
                    <button onClick={() => doAction(svc.name, 'restart')}
                      className="p-1.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 transition-colors">
                      <RefreshCw size={12} />
                    </button>
                    <button onClick={() => doAction(svc.name, 'enable')}
                      className="p-1.5 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition-colors">
                      <Power size={12} />
                    </button>
                    <button onClick={() => doAction(svc.name, 'disable')}
                      className="p-1.5 rounded bg-gray-500/10 hover:bg-gray-500/20 text-gray-400 transition-colors">
                      <PowerOff size={12} />
                    </button>
                  </div>
                </td>
                <td className="p-4">
                  <button
                    onClick={() => viewLogs(svc.name)}
                    className="p-1.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 transition-colors"
                  >
                    <FileText size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && services.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p>No services found</p>
          </div>
        )}
      </div>

      {/* Log Viewer */}
      {selectedService && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Logs: {selectedService}</h2>
            <button
              onClick={() => { setSelectedService(null); setLogs('') }}
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              Close
            </button>
          </div>
          <pre className="glass rounded-xl p-4 text-xs font-mono text-gray-400 overflow-auto max-h-96 leading-relaxed">
            {logs || 'No logs available'}
          </pre>
        </div>
      )}
    </div>
  )
}
