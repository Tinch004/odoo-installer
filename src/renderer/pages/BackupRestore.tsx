import React, { useEffect, useState } from 'react'
import { Download, Upload, Clock, Trash2, RefreshCw, AlertCircle, CheckCircle2, Database, FolderOpen } from 'lucide-react'
import type { BackupFile, ActionResult } from '../types'

const API = window.electronAPI

export default function BackupRestore() {
  const [instances, setInstances] = useState<Array<{ version: string; path: string }>>([])
  const [selectedInstance, setSelectedInstance] = useState('')
  const [backups, setBackups] = useState<BackupFile[]>([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const showResult = (res: ActionResult) => {
    setResult({ type: res.success ? 'success' : 'error', message: res.message })
    setTimeout(() => setResult(null), 5000)
  }

  useEffect(() => {
    API.detectLocalVersions().then(vers => {
      setInstances(vers.map(v => ({ version: v.version, path: v.path })))
      if (vers.length > 0) setSelectedInstance(vers[0].path)
    })
  }, [])

  useEffect(() => {
    if (selectedInstance) loadBackups()
  }, [selectedInstance])

  const loadBackups = async () => {
    setLoading(true)
    const list = await API.backupList(selectedInstance)
    setBackups(list)
    setLoading(false)
  }

  const handleCreate = async () => {
    const dbName = selectedInstance.split('/').pop() || 'odoo'
    const res = await API.backupCreate(selectedInstance, dbName)
    showResult(res)
    loadBackups()
  }

  const handleRestore = async (backup: BackupFile) => {
    const dbName = selectedInstance.split('/').pop() || 'odoo'
    const res = await API.backupRestore(backup.path, dbName, 'odoo', selectedInstance)
    showResult(res)
  }

  const handleClean = async () => {
    const res = await API.backupClean(selectedInstance)
    showResult(res)
    loadBackups()
  }

  const handleSchedule = async (freq: 'daily' | 'weekly' | 'monthly') => {
    const res = await API.backupSchedule(freq)
    showResult(res)
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Backup & Restore</h1>
          <p className="text-gray-500 text-sm mt-1">Database backups and restoration</p>
        </div>
      </div>

      {result && (
        <div className={`glass rounded-xl p-3 mb-4 flex items-center gap-2 text-sm ${
          result.type === 'success' ? 'border border-green-500/20 text-green-400' : 'border border-red-500/20 text-red-400'
        }`}>
          {result.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {result.message}
        </div>
      )}

      {/* Instance Selector */}
      <div className="glass rounded-xl p-6 mb-6">
        <div className="flex items-center gap-4">
          <Database size={18} className="text-indigo-400" />
          <select
            value={selectedInstance}
            onChange={e => setSelectedInstance(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
          >
            {instances.map(inst => (
              <option key={inst.path} value={inst.path}>
                Odoo {inst.version} - {inst.path}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <button onClick={handleCreate}
          className="glass rounded-xl p-4 flex items-center gap-3 hover:bg-gray-800/50 transition-colors text-left">
          <div className="p-2 rounded-lg bg-indigo-500/10">
            <Download size={20} className="text-indigo-400" />
          </div>
          <div>
            <div className="text-sm font-medium">Create Backup</div>
            <div className="text-xs text-gray-500 mt-0.5">pg_dump custom format</div>
          </div>
        </button>

        <button onClick={handleClean}
          className="glass rounded-xl p-4 flex items-center gap-3 hover:bg-gray-800/50 transition-colors text-left">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <Trash2 size={20} className="text-amber-400" />
          </div>
          <div>
            <div className="text-sm font-medium">Clean Old Backups</div>
            <div className="text-xs text-gray-500 mt-0.5">Remove backups &gt;30 days</div>
          </div>
        </button>

        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <Clock size={20} className="text-green-400" />
            </div>
            <div className="text-sm font-medium">Schedule Backup</div>
          </div>
          <div className="flex gap-2">
            {(['daily', 'weekly', 'monthly'] as const).map(freq => (
              <button key={freq} onClick={() => handleSchedule(freq)}
                className="flex-1 px-2 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 capitalize transition-colors">
                {freq}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Backup List */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-sm font-medium text-gray-300">Backups</h2>
          <button onClick={loadBackups} className="p-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 transition-colors">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {backups.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <FolderOpen size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No backups found</p>
            <p className="text-xs text-gray-600 mt-1">Create your first backup to get started</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Size</th>
                <th className="text-right p-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.map(backup => (
                <tr key={backup.name} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="p-4">
                    <span className="text-sm font-mono text-gray-300">{backup.name}</span>
                  </td>
                  <td className="p-4 text-sm text-gray-400">{formatDate(backup.date)}</td>
                  <td className="p-4 text-sm text-gray-400">{formatSize(backup.size)}</td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => handleRestore(backup)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-medium transition-colors"
                    >
                      <Upload size={12} />
                      Restore
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
