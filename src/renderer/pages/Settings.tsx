import React, { useState, useEffect } from 'react'
import { Settings as SettingsIcon, Server, Database, FolderOpen, Save, CheckCircle2, AlertCircle, Folder } from 'lucide-react'
import type { ConnectionInfo } from '../types'

const API = window.electronAPI

const DEFAULT_CONNECTION = { url: 'localhost', port: 8069, db: 'odoo17', username: 'admin', password: 'admin' }

export default function Settings() {
  const [connection, setConnection] = useState(DEFAULT_CONNECTION)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [saved, setSaved] = useState(false)
  const [projectsDir, setProjectsDir] = useState('')
  const [dirMsg, setDirMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    API.getProjectsDir().then(setProjectsDir)
  }, [])

  useEffect(() => {
    const savedConfig = localStorage.getItem('odoo-manager-config')
    if (savedConfig) {
      try {
        setConnection(JSON.parse(savedConfig))
        return
      } catch {}
    }
    API.getConnectionInfo().then((info: ConnectionInfo | null) => {
      if (info) {
        setConnection({ url: info.host, port: info.port, db: info.db, username: info.username, password: info.password })
      }
    })
  }, [])

  const testConnection = async () => {
    const ok = await API.connect(connection)
    setTestResult({ success: ok, message: ok ? 'Connection successful!' : 'Connection failed' })
    setTimeout(() => setTestResult(null), 3000)
  }

  const saveSettings = () => {
    localStorage.setItem('odoo-manager-config', JSON.stringify(connection))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const selectDir = async () => {
    const dir = await API.selectProjectsDir()
    if (dir) {
      setProjectsDir(dir)
      setDirMsg({ type: 'success', text: `Directory updated: ${dir}` })
      setTimeout(() => setDirMsg(null), 3000)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold gradient-text">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Configure Odoo connection and preferences</p>
      </div>

      {/* Projects Directory */}
      <div className="glass rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Folder size={14} />
          Projects Directory
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          Odoo instances will be installed in this directory (e.g. odoo17, odoo16, etc.)
        </p>
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 truncate">
            {projectsDir || 'Loading...'}
          </div>
          <button
            onClick={selectDir}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors whitespace-nowrap"
          >
            <FolderOpen size={14} />
            Browse
          </button>
        </div>
        {dirMsg && (
          <div className={`mt-2 text-xs flex items-center gap-1 ${
            dirMsg.type === 'success' ? 'text-green-400' : 'text-red-400'
          }`}>
            {dirMsg.type === 'success' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
            {dirMsg.text}
          </div>
        )}
      </div>

      {/* Connection Settings */}
      <div className="glass rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Server size={14} />
          Odoo Connection
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Host</label>
            <input
              type="text"
              value={connection.url}
              onChange={e => setConnection(c => ({ ...c, url: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Port</label>
            <input
              type="number"
              value={connection.port}
              onChange={e => setConnection(c => ({ ...c, port: parseInt(e.target.value) || 8069 }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Database</label>
            <input
              type="text"
              value={connection.db}
              onChange={e => setConnection(c => ({ ...c, db: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Username</label>
            <input
              type="text"
              value={connection.username}
              onChange={e => setConnection(c => ({ ...c, username: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Password</label>
            <input
              type="password"
              value={connection.password}
              onChange={e => setConnection(c => ({ ...c, password: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={testConnection}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors"
          >
            <Server size={14} />
            Test Connection
          </button>
          <button
            onClick={saveSettings}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors"
          >
            <Save size={14} />
            {saved ? 'Saved!' : 'Save Settings'}
          </button>
        </div>
        {testResult && (
          <div className={`mt-3 text-xs flex items-center gap-1 ${
            testResult.success ? 'text-green-400' : 'text-red-400'
          }`}>
            {testResult.success ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
            {testResult.message}
          </div>
        )}
      </div>

      {/* System Info */}
      <div className="glass rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Database size={14} />
          System Information
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Platform</span><span className="text-gray-300">{navigator.platform}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">App Version</span><span className="text-gray-300">1.0.0</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Projects Directory</span><span className="text-gray-300">{projectsDir}</span></div>
        </div>
      </div>
    </div>
  )
}
