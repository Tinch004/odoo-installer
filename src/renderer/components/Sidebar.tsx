import React from 'react'
import {
  LayoutDashboard, Server, Package, Store, Layers,
  HardDrive, Globe, Stethoscope, Settings,
} from 'lucide-react'
import type { Page } from '../App'

interface SidebarProps {
  currentPage: Page
  onNavigate: (page: Page) => void
}

const navItems: { page: Page; label: string; icon: React.ReactNode }[] = [
  { page: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { page: 'services', label: 'Services', icon: <Server size={18} /> },
  { page: 'modules', label: 'Modules', icon: <Package size={18} /> },
  { page: 'store', label: 'Store', icon: <Store size={18} /> },
  { page: 'versions', label: 'Versions', icon: <Layers size={18} /> },
  { page: 'backup', label: 'Backup', icon: <HardDrive size={18} /> },
  { page: 'network', label: 'Network', icon: <Globe size={18} /> },
  { page: 'doctor', label: 'Doctor', icon: <Stethoscope size={18} /> },
  { page: 'settings', label: 'Settings', icon: <Settings size={18} /> },
]

export default function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  return (
    <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col py-4">
      <div className="px-4 mb-6">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Navigation</div>
      </div>
      <nav className="flex-1 space-y-1 px-2">
        {navItems.map(({ page, label, icon }) => (
          <button
            key={page}
            onClick={() => onNavigate(page)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              currentPage === page
                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
            }`}
          >
            {icon}
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="px-4 mt-6">
        <div className="text-[10px] text-gray-600">
          v1.0.0
        </div>
      </div>
    </aside>
  )
}
