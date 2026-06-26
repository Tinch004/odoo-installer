import React, { useState } from 'react'
import Sidebar from './components/Sidebar'
import TitleBar from './components/TitleBar'
import Dashboard from './pages/Dashboard'
import Services from './pages/Services'
import Modules from './pages/Modules'
import ModuleStore from './pages/ModuleStore'
import VersionInstaller from './pages/VersionInstaller'
import BackupRestore from './pages/BackupRestore'
import Network from './pages/Network'
import Doctor from './pages/Doctor'
import Settings from './pages/Settings'

export type Page = 'dashboard' | 'services' | 'modules' | 'store' | 'versions' | 'backup' | 'network' | 'doctor' | 'settings'

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard />
      case 'services': return <Services />
      case 'modules': return <Modules />
      case 'store': return <ModuleStore />
      case 'versions': return <VersionInstaller />
      case 'backup': return <BackupRestore />
      case 'network': return <Network />
      case 'doctor': return <Doctor />
      case 'settings': return <Settings />
      default: return <Dashboard />
    }
  }

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar currentPage={page} onNavigate={setPage} />
        <main className="flex-1 overflow-y-auto p-6">
          {renderPage()}
        </main>
      </div>
    </div>
  )
}
