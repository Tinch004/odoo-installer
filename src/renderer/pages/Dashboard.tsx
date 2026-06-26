import React, { useEffect, useState } from 'react'
import { Server, Database, Package, Activity, RefreshCw, Play, Square, AlertCircle } from 'lucide-react'
import type { ServiceInfo } from '../types'

const API = window.electronAPI

export default function Dashboard() {
  const [services, setServices] = useState<ServiceInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadServices = async () => {
    try {
      setLoading(true)
      const svcs = await API.listServices()
      setServices(svcs)
      setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadServices() }, [])

  const runningCount = services.filter(s => s.status === 'running').length
  const totalPorts = services.map(s => s.port).join(', ')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Odoo instances overview</p>
        </div>
        <button
          onClick={loadServices}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <Server size={18} className="text-indigo-400" />
            </div>
            <span className="text-xs font-medium text-gray-500">Instances</span>
          </div>
          <div className="text-2xl font-bold">{services.length}</div>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Activity size={18} className="text-green-400" />
            </div>
            <span className="text-xs font-medium text-gray-500">Running</span>
          </div>
          <div className="text-2xl font-bold text-green-400">{runningCount}</div>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Database size={18} className="text-blue-400" />
            </div>
            <span className="text-xs font-medium text-gray-500">Ports</span>
          </div>
          <div className="text-sm font-medium text-blue-400">{totalPorts || 'None'}</div>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Package size={18} className="text-amber-400" />
            </div>
            <span className="text-xs font-medium text-gray-500">Addons Paths</span>
          </div>
          <div className="text-2xl font-bold">
            {services.reduce((a, s) => a + s.addonsPaths.length, 0)}
          </div>
        </div>
      </div>

      {/* Service cards */}
      {error && (
        <div className="glass rounded-xl p-4 border border-red-500/20 mb-4">
          <div className="flex items-center gap-2 text-red-400">
            <AlertCircle size={16} />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      <h2 className="text-lg font-semibold mb-3">Instances</h2>
      <div className="space-y-3">
        {services.map(svc => (
          <div key={svc.name} className="glass rounded-xl p-4 card-hover">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full status-pulse ${
                  svc.status === 'running' ? 'bg-green-400' :
                  svc.status === 'stopped' ? 'bg-gray-500' : 'bg-red-400'
                }`} />
                <div>
                  <div className="font-semibold">{svc.name}</div>
                  <div className="text-xs text-gray-500">Odoo {svc.version}</div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-sm font-medium">{svc.status}</div>
                  <div className="text-xs text-gray-500">Port {svc.port}</div>
                </div>
                <div className="text-xs text-gray-500 w-20 text-right">{svc.memory}</div>
                <div className="flex gap-1">
                  {svc.status === 'running' ? (
                    <button
                      onClick={() => API.stopService(svc.name).then(loadServices)}
                      className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                    >
                      <Square size={14} />
                    </button>
                  ) : (
                    <button
                      onClick={() => API.startService(svc.name).then(loadServices)}
                      className="p-2 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 transition-colors"
                    >
                      <Play size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
            {svc.addonsPaths.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {svc.addonsPaths.map((p, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-500">
                    {p.split('/').pop()}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {!loading && services.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Server size={32} className="mx-auto mb-2 opacity-50" />
            <p>No Odoo instances detected</p>
            <p className="text-xs mt-1">Go to Versions to install one</p>
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
