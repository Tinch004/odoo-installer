import React, { useState } from 'react'
import { Search, Star, GitBranch, Download, ExternalLink, AlertCircle, CheckCircle2, BookOpen } from 'lucide-react'
import type { OCAModule } from '../types'

const API = window.electronAPI

const CATEGORIES = [
  'All', 'Accounting', 'Sales/CRM', 'Inventory/Logistics', 'Human Resources',
  'Manufacturing', 'Website/E-commerce', 'Point of Sale', 'Project Management',
  'Communication', 'Reporting', 'User Interface', 'Technical Tools', 'Technical/Web', 'Other'
]

export default function ModuleStore() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [odooVersion, setOdooVersion] = useState('17.0')
  const [results, setResults] = useState<OCAModule[]>([])
  const [loading, setLoading] = useState(false)
  const [installing, setInstalling] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const showMsg = (type: 'success' | 'error', text: string) => {
    setActionMsg({ type, text })
    setTimeout(() => setActionMsg(null), 4000)
  }

  const search = async () => {
    if (!query.trim() && category === 'All') return
    setLoading(true)
    try {
      const q = category !== 'All' && !query.trim() ? category : query
      const mods = await API.searchStore(q, odooVersion)
      setResults(mods)
      if (mods.length === 0) showMsg('error', 'No modules found. Try a different search or version.')
    } catch (e: any) {
      showMsg('error', 'Search failed: ' + e.message)
    }
    setLoading(false)
  }

  const installRepo = async (repoUrl: string) => {
    setInstalling(repoUrl)
    const result = await API.installFromStore('odoo17', repoUrl + '.git', odooVersion)
    showMsg(result.success ? 'success' : 'error', result.message)
    setInstalling(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Module Store</h1>
          <p className="text-gray-500 text-sm mt-1">Browse and install modules from OCA repositories</p>
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

      {/* Search bar */}
      <div className="glass rounded-xl p-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search modules by name or keyword..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search()}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-gray-300 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <select
            value={odooVersion}
            onChange={e => setOdooVersion(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="18.0">Odoo 18.0</option>
            <option value="17.0">Odoo 17.0</option>
            <option value="16.0">Odoo 16.0</option>
            <option value="15.0">Odoo 15.0</option>
          </select>
          <button
            onClick={search}
            disabled={loading}
            className="px-4 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* Category chips */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => { setCategory(cat); if (cat !== 'All' || query) search() }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                category === cat
                  ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                  : 'bg-gray-800 text-gray-500 hover:text-gray-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div className="space-y-3">
        {results.map(mod => (
          <div key={mod.repo} className="glass rounded-xl p-4 card-hover">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm">{mod.name}</h3>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">{mod.category}</span>
                  {mod.license && <span className="text-[10px] text-gray-600">{mod.license}</span>}
                </div>
                <p className="text-xs text-gray-500 mt-1">{mod.description || 'No description available'}</p>
                <div className="flex items-center gap-4 mt-2">
                  <a
                    href={mod.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300"
                  >
                    <ExternalLink size={11} />
                    GitHub
                  </a>
                  {mod.stars > 0 && (
                    <span className="flex items-center gap-1 text-[11px] text-amber-400">
                      <Star size={11} />
                      {mod.stars}
                    </span>
                  )}
                  {mod.compatibleVersions.length > 0 && (
                    <span className="flex items-center gap-1 text-[11px] text-gray-500">
                      <GitBranch size={11} />
                      {mod.compatibleVersions.join(', ')}
                    </span>
                  )}
                  <span className="text-[11px] text-gray-600">
                    <BookOpen size={11} className="inline mr-1" />
                    Multi-module repo
                  </span>
                </div>
              </div>
              <button
                onClick={() => installRepo(mod.url)}
                disabled={installing === mod.url}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 text-xs font-medium transition-colors disabled:opacity-30 shrink-0 ml-4"
              >
                {installing === mod.url ? (
                  <div className="w-3 h-3 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Download size={12} />
                )}
                Install
              </button>
            </div>
          </div>
        ))}

        {results.length === 0 && !loading && (
          <div className="text-center py-16">
            <BookOpen size={48} className="mx-auto mb-4 text-gray-700" />
            <h3 className="text-lg font-medium text-gray-400 mb-1">Explore Odoo Modules</h3>
            <p className="text-sm text-gray-600 max-w-md mx-auto">
              Search the Odoo Community Association (OCA) repository collection. Over 20,000 free and open-source modules across 260+ repos.
            </p>
            <div className="flex flex-wrap gap-2 justify-center mt-6">
              {['accounting', 'sale', 'stock', 'web', 'pos', 'hr'].map(tag => (
                <button
                  key={tag}
                  onClick={() => { setQuery(tag); setTimeout(search, 100) }}
                  className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 text-xs hover:bg-gray-700 transition-colors"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div className="text-center py-12 text-gray-500">
            <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p>Searching OCA repositories...</p>
          </div>
        )}
      </div>
    </div>
  )
}
