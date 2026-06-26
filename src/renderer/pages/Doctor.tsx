import React, { useEffect, useState } from 'react'
import { Stethoscope, Wrench, RefreshCw, CheckCircle2, XCircle, MinusCircle, AlertCircle, CheckCircle2 as CheckCircle } from 'lucide-react'
import type { DoctorCheck, ActionResult } from '../types'

const API = window.electronAPI

export default function Doctor() {
  const [instances, setInstances] = useState<Array<{ version: string; path: string; hasService: boolean }>>([])
  const [selectedInstance, setSelectedInstance] = useState('')
  const [checks, setChecks] = useState<DoctorCheck[]>([])
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    API.detectLocalVersions().then(vers => {
      setInstances(vers)
      if (vers.length > 0) setSelectedInstance(vers[0].path)
    })
  }, [])

  const handleCheck = async () => {
    if (!selectedInstance) return
    setRunning(true)
    setResult(null)
    const res = await API.doctorCheck(selectedInstance)
    setChecks(res)
    setRunning(false)
  }

  const handleFix = async () => {
    if (!selectedInstance) return
    setRunning(true)
    const res = await API.doctorFix(selectedInstance)
    setResult({ type: res.success ? 'success' : 'error', message: res.message })
    setRunning(false)
    // Re-run checks after fix
    handleCheck()
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case 'ok': return <CheckCircle2 size={16} className="text-green-400" />
      case 'fail': return <XCircle size={16} className="text-red-400" />
      case 'skip': return <MinusCircle size={16} className="text-gray-500" />
      default: return <MinusCircle size={16} className="text-gray-500" />
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold gradient-text">System Doctor</h1>
          <p className="text-gray-500 text-sm mt-1">Diagnose and repair Odoo installations</p>
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

      {/* Instance Selector + Actions */}
      <div className="glass rounded-xl p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm text-gray-400 mb-1">Odoo Instance</label>
            <select
              value={selectedInstance}
              onChange={e => setSelectedInstance(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
            >
              {instances.map(inst => (
                <option key={inst.path} value={inst.path}>
                  Odoo {inst.version} - {inst.path} {inst.hasService ? '(service)' : '(no service)'}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleCheck}
            disabled={running || !selectedInstance}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium disabled:opacity-50 transition-colors mt-5"
          >
            <Stethoscope size={16} className={running ? 'animate-pulse' : ''} />
            Run Check
          </button>
          <button
            onClick={handleFix}
            disabled={running || !selectedInstance}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-sm font-medium disabled:opacity-50 transition-colors mt-5"
          >
            <Wrench size={16} className={running ? 'animate-pulse' : ''} />
            Fix All
          </button>
        </div>
      </div>

      {/* Results */}
      {checks.length > 0 && (
        <div className="glass rounded-xl overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-800">
            <h2 className="text-sm font-medium text-gray-300">
              Results ({checks.filter(c => c.status === 'ok').length}/{checks.length} passed)
            </h2>
            <button onClick={handleCheck} className="p-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>

          <div className="divide-y divide-gray-800/50">
            {checks.map((check, i) => (
              <div key={i} className="flex items-center justify-between p-4 hover:bg-gray-800/30 transition-colors">
                <div className="flex items-center gap-3">
                  {statusIcon(check.status)}
                  <span className={`text-sm ${
                    check.status === 'ok' ? 'text-gray-300' :
                    check.status === 'fail' ? 'text-red-300' : 'text-gray-500'
                  }`}>
                    {check.label}
                  </span>
                </div>
                {check.details && (
                  <span className={`text-xs ${
                    check.status === 'fail' ? 'text-red-400' : 'text-gray-500'
                  }`}>
                    {check.details}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!running && checks.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          <Stethoscope size={40} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">Select an instance and run a check</p>
          <p className="text-xs text-gray-600 mt-1">Doctor will verify all components of your Odoo installation</p>
        </div>
      )}
    </div>
  )
}
