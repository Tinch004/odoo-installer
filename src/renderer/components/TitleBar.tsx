import React from 'react'
import { X, Minus, Square } from 'lucide-react'

export default function TitleBar() {
  return (
    <div className="titlebar h-10 bg-gray-900 flex items-center justify-between px-3 border-b border-gray-800">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600" />
        <span className="text-sm font-semibold text-gray-300">Odoo Manager</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => window.electronAPI.minimize()}
          className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={() => window.electronAPI.maximize()}
          className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
        >
          <Square size={12} />
        </button>
        <button
          onClick={() => window.electronAPI.close()}
          className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
