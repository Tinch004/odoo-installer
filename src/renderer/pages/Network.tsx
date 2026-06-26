import React, { useEffect, useState } from 'react'
import { Globe, Shield, Cloud, Plus, Trash2, RefreshCw, Play, Square, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react'
import type { ActionResult } from '../types'

const API = window.electronAPI

type Tab = 'nginx' | 'ssl' | 'tunnel'

export default function Network() {
  const [tab, setTab] = useState<Tab>('nginx')
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Nginx state
  const [nginxActive, setNginxActive] = useState(false)
  const [nginxConfigured, setNginxConfigured] = useState(false)
  const [nginxDomain, setNginxDomain] = useState('')
  const [nginxPort, setNginxPort] = useState(8069)

  // SSL state
  const [sslConfigured, setSslConfigured] = useState(false)
  const [sslDomain, setSslDomain] = useState('')
  const [sslCertInfo, setSslCertInfo] = useState('')

  // Tunnel state
  const [tunnelActive, setTunnelActive] = useState(false)
  const [tunnelConfigured, setTunnelConfigured] = useState(false)
  const [tunnelUrl, setTunnelUrl] = useState('')
  const [tunnelMode, setTunnelMode] = useState<'named' | 'quick'>('quick')
  const [tunnelDomain, setTunnelDomain] = useState('')
  const [tunnelSubdomain, setTunnelSubdomain] = useState('odoo')
  const [tunnelPort, setTunnelPort] = useState(8069)

  const showResult = (res: ActionResult) => {
    setResult({ type: res.success ? 'success' : 'error', message: res.message })
    setTimeout(() => setResult(null), 5000)
  }

  const refreshNginx = async () => {
    const status = await API.nginxStatus()
    setNginxActive(status.active)
    setNginxConfigured(await API.nginxIsConfigured())
  }

  const refreshSSL = async () => {
    const configured = await API.sslIsConfigured()
    setSslConfigured(configured)
    if (configured) {
      const info = await API.sslStatus()
      setSslCertInfo(info.message)
    }
  }

  const refreshTunnel = async () => {
    const status = await API.tunnelStatus()
    setTunnelActive(status.active)
    setTunnelConfigured(await API.tunnelIsConfigured())
    const urlRes = await API.tunnelUrl()
    if (urlRes.success) setTunnelUrl(urlRes.message)
  }

  useEffect(() => { refreshNginx() }, [])
  useEffect(() => { if (tab === 'ssl') refreshSSL() }, [tab])
  useEffect(() => { if (tab === 'tunnel') refreshTunnel() }, [tab])

  const handleNginxInstall = async () => {
    if (!nginxDomain) return
    const res = await API.nginxInstall(nginxDomain, nginxPort)
    showResult(res)
    refreshNginx()
  }

  const handleNginxUninstall = async () => {
    const res = await API.nginxUninstall()
    showResult(res)
    refreshNginx()
  }

  const handleSSLInstall = async () => {
    if (!sslDomain) return
    const res = await API.sslInstall(sslDomain)
    showResult(res)
    refreshSSL()
  }

  const handleSSLrenew = async () => {
    const res = await API.sslRenew()
    showResult(res)
    refreshSSL()
  }

  const handleTunnelInstall = async () => {
    if (tunnelMode === 'named') {
      if (!tunnelDomain) return
      const res = await API.tunnelInstallNamed(tunnelDomain, tunnelSubdomain, tunnelPort)
      showResult(res)
    } else {
      const res = await API.tunnelInstallQuick(tunnelPort)
      showResult(res)
    }
    refreshTunnel()
  }

  const handleTunnelStop = async () => {
    const res = await API.tunnelStop()
    showResult(res)
    refreshTunnel()
  }

  const handleTunnelStart = async () => {
    const res = await API.tunnelStart()
    showResult(res)
    refreshTunnel()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Network</h1>
          <p className="text-gray-500 text-sm mt-1">Nginx, SSL and Cloudflare Tunnel management</p>
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

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(['nginx', 'ssl', 'tunnel'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t
                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                : 'bg-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            {t === 'nginx' ? <Globe size={16} /> : t === 'ssl' ? <Shield size={16} /> : <Cloud size={16} />}
            {t === 'nginx' ? 'Nginx' : t === 'ssl' ? 'SSL / Certbot' : 'Cloudflare Tunnel'}
          </button>
        ))}
      </div>

      {/* Nginx Tab */}
      {tab === 'nginx' && (
        <div className="space-y-6">
          <div className="glass rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Nginx Proxy</h2>
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                  nginxConfigured ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-400'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${nginxConfigured ? 'bg-green-400' : 'bg-gray-500'}`} />
                  {nginxConfigured ? 'Configurado' : 'No configurado'}
                </span>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                  nginxActive ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${nginxActive ? 'bg-green-400' : 'bg-red-400'}`} />
                  {nginxActive ? 'Activo' : 'Inactivo'}
                </span>
                <button onClick={refreshNginx} className="p-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 transition-colors">
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            {!nginxConfigured ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Domain</label>
                    <input
                      type="text"
                      value={nginxDomain}
                      onChange={e => setNginxDomain(e.target.value)}
                      placeholder="ejemplo.com"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Odoo Port</label>
                    <input
                      type="number"
                      value={nginxPort}
                      onChange={e => setNginxPort(Number(e.target.value))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
                <button
                  onClick={handleNginxInstall}
                  disabled={!nginxDomain}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  <Plus size={16} />
                  Install & Configure Nginx
                </button>
              </div>
            ) : (
              <div className="flex gap-3">
                <button onClick={handleNginxUninstall}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-medium transition-colors">
                  <Trash2 size={16} />
                  Uninstall
                </button>
                <button onClick={async () => { const res = await API.nginxRestart(); showResult(res) }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-sm font-medium transition-colors">
                  <RefreshCw size={16} />
                  Restart
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SSL Tab */}
      {tab === 'ssl' && (
        <div className="space-y-6">
          <div className="glass rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">SSL / Let's Encrypt</h2>
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                  sslConfigured ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-400'
                }`}>
                  {sslConfigured ? 'Configurado' : 'No configurado'}
                </span>
                <button onClick={refreshSSL} className="p-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 transition-colors">
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            {!sslConfigured ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-400">Requiere Nginx configurado previamente y un dominio real.</p>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Domain</label>
                  <input
                    type="text"
                    value={sslDomain}
                    onChange={e => setSslDomain(e.target.value)}
                    placeholder="ejemplo.com"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <button
                  onClick={handleSSLInstall}
                  disabled={!sslDomain}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  <Shield size={16} />
                  Install SSL Certificate
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <pre className="bg-gray-900 rounded-lg p-4 text-xs font-mono text-gray-400 overflow-auto max-h-48">
                  {sslCertInfo || 'Cargando...'}
                </pre>
                <div className="flex gap-3">
                  <button onClick={handleSSLrenew}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-sm font-medium transition-colors">
                    <RefreshCw size={16} />
                    Renew
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tunnel Tab */}
      {tab === 'tunnel' && (
        <div className="space-y-6">
          <div className="glass rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Cloudflare Tunnel</h2>
              <div className="flex items-center gap-3">
                {tunnelUrl && (
                  <a href={tunnelUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 text-xs">
                    <ExternalLink size={12} />
                    {tunnelUrl}
                  </a>
                )}
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                  tunnelConfigured ? (tunnelActive ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400') : 'bg-gray-500/10 text-gray-400'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${tunnelActive ? 'bg-green-400' : tunnelConfigured ? 'bg-amber-400' : 'bg-gray-500'}`} />
                  {tunnelConfigured ? (tunnelActive ? 'Activo' : 'Detenido') : 'No configurado'}
                </span>
                <button onClick={refreshTunnel} className="p-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 transition-colors">
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            {!tunnelConfigured ? (
              <div className="space-y-4">
                <div className="flex gap-3 mb-4">
                  <button
                    onClick={() => setTunnelMode('named')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      tunnelMode === 'named'
                        ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                        : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    Con dominio propio
                  </button>
                  <button
                    onClick={() => setTunnelMode('quick')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      tunnelMode === 'quick'
                        ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                        : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    URL temporal
                  </button>
                </div>

                {tunnelMode === 'named' ? (
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Domain</label>
                      <input
                        type="text"
                        value={tunnelDomain}
                        onChange={e => setTunnelDomain(e.target.value)}
                        placeholder="ejemplo.com"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Subdomain</label>
                      <input
                        type="text"
                        value={tunnelSubdomain}
                        onChange={e => setTunnelSubdomain(e.target.value)}
                        placeholder="odoo"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Odoo Port</label>
                      <input
                        type="number"
                        value={tunnelPort}
                        onChange={e => setTunnelPort(Number(e.target.value))}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Odoo Port</label>
                    <input
                      type="number"
                      value={tunnelPort}
                      onChange={e => setTunnelPort(Number(e.target.value))}
                      className="w-32 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                )}

                <button
                  onClick={handleTunnelInstall}
                  disabled={tunnelMode === 'named' && !tunnelDomain}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  <Cloud size={16} />
                  {tunnelMode === 'named' ? 'Install Named Tunnel' : 'Install Quick Tunnel'}
                </button>
              </div>
            ) : (
              <div className="flex gap-3">
                <button onClick={handleTunnelStart} disabled={tunnelActive}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 text-sm font-medium disabled:opacity-30 transition-colors">
                  <Play size={16} />
                  Start
                </button>
                <button onClick={handleTunnelStop} disabled={!tunnelActive}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-medium disabled:opacity-30 transition-colors">
                  <Square size={16} />
                  Stop
                </button>
                <button onClick={async () => { const res = await API.tunnelRestart(); showResult(res) }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-sm font-medium transition-colors">
                  <RefreshCw size={16} />
                  Restart
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
