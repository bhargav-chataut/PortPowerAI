import { useState } from 'react'
import { Activity, Layers3 } from 'lucide-react'
import Header from './components/dashboard/Header'
import MetricsPanel from './components/dashboard/MetricsPanel'
import Sidebar from './components/dashboard/Sidebar'
import EarthMap from './components/maps/EarthMap'
import { ports } from './components/maps/EarthMap'
import PortScene from './components/port/PortScene'

function App() {
  const [view, setView] = useState<'earth' | 'reference' | 'model'>('earth')
  const [operationsOpen, setOperationsOpen] = useState(true)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [selectedPortName, setSelectedPortName] = useState(ports[0].name)

  return (
    <main className="relative h-screen w-full overflow-hidden bg-[#090b10]">
      <Header />
      <nav aria-label="Monitored AIS regions" className="pointer-events-auto absolute left-1/2 top-20 z-[1002] flex -translate-x-1/2 gap-1 rounded-xl border border-cyan-300/20 bg-[#10151c]/95 p-1 shadow-2xl backdrop-blur-xl sm:top-5">
        {([
          ['Gulfport Port', 'Gulfport'],
          ['PortMiami', 'Miami'],
        ] as const).map(([name, label]) => (
          <button
            key={name}
            type="button"
            aria-pressed={selectedPortName === name}
            onClick={() => setSelectedPortName(name)}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${selectedPortName === name ? 'bg-cyan-400 text-slate-950' : 'text-slate-300 hover:bg-white/10'}`}
          >
            {label}
          </button>
        ))}
      </nav>
      {operationsOpen && <MetricsPanel onClose={() => setOperationsOpen(false)} portName={selectedPortName} />}
      <Sidebar />

      {!operationsOpen && (
        <button
          type="button"
          onClick={() => setOperationsOpen(true)}
          className="pointer-events-auto absolute right-5 top-24 z-[1001] flex items-center gap-2 rounded-xl border border-cyan-300/20 bg-[#10151c]/90 px-4 py-3 text-xs font-bold text-cyan-200 shadow-2xl backdrop-blur-xl transition hover:bg-slate-800"
        >
          <Activity size={16} /> Live Operations
        </button>
      )}

      {switcherOpen ? (
        <div className="pointer-events-auto absolute bottom-5 right-5 z-[1000] flex items-center rounded-xl border border-white/10 bg-[#10151c]/90 p-1 shadow-2xl backdrop-blur-xl">
          {([
            ['earth', 'Earth'],
            ['reference', 'Reference'],
            ['model', '3D model'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setView(value)}
              aria-pressed={view === value}
              className={`rounded-lg px-3 py-2 text-xs font-bold transition ${view === value ? 'bg-cyan-400 text-slate-950' : 'text-slate-400 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSwitcherOpen(false)}
            aria-label="Close view selector"
            title="Close"
            className="ml-1 rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            ×
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setSwitcherOpen(true)}
          className="pointer-events-auto absolute bottom-5 right-5 z-[1000] flex items-center gap-2 rounded-xl border border-cyan-300/20 bg-[#10151c]/90 px-4 py-3 text-xs font-bold text-cyan-200 shadow-2xl backdrop-blur-xl transition hover:bg-slate-800"
        >
          <Layers3 size={16} /> Views
        </button>
      )}

      <section className="h-full w-full">
        {view === 'earth' ? (
          <EarthMap selectedPortName={selectedPortName} onSelectPort={setSelectedPortName} />
        ) : (
          <PortScene showReference={view === 'reference'} />
        )}
      </section>
    </main>
  )
}

export default App
