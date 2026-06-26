import React, { useEffect, useState, useCallback } from 'react'
import { Package, Search, Download, Upload, Trash2, RefreshCw, CheckCircle2, AlertCircle, XCircle, Filter } from 'lucide-react'
import type { ModuleInfo } from '../types'

const API = window.electronAPI

export default function Modules() {
  const [modules, setModules] = useState<ModuleInfo[]>([])
  const [filteredModules, setFilteredModules] = useState<ModuleInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'installed' | 'uninstalled'>('all')
  const [selectedDB, setSelectedDB] = useState('odoo17')
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const mods = await API.listModules(selectedDB)
      setModules(mods)
    } catch {
      setModules([])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [selectedDB])

  useEffect(() => {
    let result = modules
    if (filter === 'installed') result = result.filter(m => m.state === 'installed')
    else if (filter === 'uninstalled') result = result.filter(m => m.state === 'uninstalled')
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(m => m.name.toLowerCase().includes(q) || m.display_name.toLowerCase().includes(q) || m.summary.toLowerCase().includes(q))
    }
    setFilteredModules(result)
  }, [modules, search, filter])

  const showMsg = (type: 'success' | 'error', text: string) => {
    setActionMsg({ type, text })
    setTimeout(() => setActionMsg(null), 3000)
  }

  const doInstall = async (name: string) => {
    setProcessing(name)
    const ok = await API.installModule(selectedDB, name)
    showMsg(ok ? 'success' : 'error', ok ? `${name} installed` : `Failed to install ${name}`)
    setProcessing(null)
    load()
  }

  const doUninstall = async (name: string) => {
    setProcessing(name)
    const ok = await API.uninstallModule(selectedDB, name)
    showMsg(ok ? 'success' : 'error', ok ? `${name} uninstalled` : `Failed to uninstall ${name}`)
    setProcessing(null)
    load()
  }

  const doUpgrade = async (name: string) => {
    setProcessing(name)
    const ok = await API.upgradeModule(selectedDB, name)
    showMsg(ok ? 'success' : 'error', ok ? `${name} upgraded` : `Failed to upgrade ${name}`)
    setProcessing(null)
    load()
  }

  const handleSelectFolder = async () => {
    const folder = await API.selectFolder()
    if (folder) {
      setDragging(false)
      const result = await API.installLocal(selectedDB, folder)
      showMsg(result.success ? 'success' : 'error', result.message)
      if (result.success) load()
    }
  }

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    for (const file of files) {
      const result = await API.installLocal(selectedDB, file.path)
      showMsg(result.success ? 'success' : 'error', result.message)
    }
    load()
  }, [selectedDB])

  const installed = modules.filter(m => m.state === 'installed').length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Modules</h1>
          <p className="text-gray-500 text-sm mt-1">{installed} installed · {modules.length} available</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedDB}
            onChange={e => setSelectedDB(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="odoo17">odoo17</option>
            <option value="test01">test01</option>
          </select>
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {actionMsg && (
        <div className={`glass rounded-xl p-3 mb-4 flex items-center gap-2 text-sm ${
          actionMsg.type === 'success' ? 'border border-green-500/20 text-green-400' : 'border border-red-500/20 text-red-400'
        }`}>
          {actionMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {actionMsg.text}
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search modules..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'installed', 'uninstalled'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                filter === f ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <button
          onClick={handleSelectFolder}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-sm transition-colors"
        >
          <Upload size={14} />
          Install Folder
        </button>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`dropzone rounded-xl p-8 mb-4 text-center transition-all cursor-pointer ${
          dragging ? 'active' : ''
        }`}
      >
        {dragging ? (
          <div>
            <Download size={32} className="mx-auto mb-2 text-indigo-400" />
            <p className="text-indigo-400 font-medium">Drop module here to install</p>
          </div>
        ) : (
          <div>
            <Package size={32} className="mx-auto mb-2 text-gray-600" />
            <p className="text-gray-500 text-sm">Drag & drop Odoo modules here</p>
            <p className="text-gray-600 text-xs mt-1">Supports .zip, .tgz, and folders</p>
          </div>
        )}
      </div>

      {/* Module list */}
      <div className="space-y-2">
        {filteredModules.map(mod => (
          <div key={mod.id} className="glass rounded-xl p-4 hover:bg-gray-800/50 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-sm truncate">{mod.display_name}</h3>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    mod.state === 'installed' ? 'bg-green-500/10 text-green-400' :
                    mod.state === 'uninstalled' ? 'bg-gray-500/10 text-gray-400' :
                    'bg-amber-500/10 text-amber-400'
                  }`}>
                    {mod.state}
                  </span>
                  {mod.application && <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400">App</span>}
                </div>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{mod.summary || 'No description'}</p>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-[10px] text-gray-600">{mod.category}</span>
                  <span className="text-[10px] text-gray-600">v{mod.version}</span>
                  {mod.author && <span className="text-[10px] text-gray-600">{mod.author}</span>}
                  {mod.depends.length > 0 && (
                    <span className="text-[10px] text-gray-600">Depends: {mod.depends.slice(0, 3).join(', ')}{mod.depends.length > 3 ? '...' : ''}</span>
                  )}
                </div>
              </div>
              <div className="flex gap-1 ml-4 shrink-0">
                {mod.state === 'uninstalled' && (
                  <button
                    onClick={() => doInstall(mod.name)}
                    disabled={processing === mod.name}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 text-xs transition-colors disabled:opacity-30"
                  >
                    {processing === mod.name ? <RefreshCw size={12} className="animate-spin" /> : <Download size={12} />}
                    Install
                  </button>
                )}
                {mod.state === 'installed' && (
                  <>
                    <button
                      onClick={() => doUpgrade(mod.name)}
                      disabled={processing === mod.name}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs transition-colors disabled:opacity-30"
                    >
                      <RefreshCw size={12} className={processing === mod.name ? 'animate-spin' : ''} />
                      Upgrade
                    </button>
                    <button
                      onClick={() => doUninstall(mod.name)}
                      disabled={processing === mod.name}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs transition-colors disabled:opacity-30"
                    >
                      <Trash2 size={12} />
                      Uninstall
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
        {!loading && filteredModules.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Package size={32} className="mx-auto mb-2 opacity-50" />
            <p>No modules found</p>
          </div>
        )}
        {loading && (
          <div className="text-center py-12 text-gray-500">
            <RefreshCw size={24} className="mx-auto mb-2 animate-spin" />
            <p>Loading modules...</p>
          </div>
        )}
      </div>
    </div>
  )
}
