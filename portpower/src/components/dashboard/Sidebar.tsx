import { Camera, Layers3, Map, Route, ShipWheel } from 'lucide-react'

const tools = [
  { label: 'Map', icon: Map, active: true },
  { label: 'Vessels', icon: ShipWheel },
  { label: 'Routes', icon: Route },
  { label: 'Cameras', icon: Camera },
  { label: 'Layers', icon: Layers3 },
]

export default function Sidebar() {
  return (
    <nav className="pointer-events-auto absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-white/10 bg-[#10151c]/90 p-1.5 shadow-2xl backdrop-blur-xl" aria-label="Aerial view tools">
      {tools.map(({ label, icon: Icon, active }) => (
        <button
          key={label}
          type="button"
          title={label}
          className={`flex h-10 min-w-10 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold transition ${active ? 'bg-cyan-400 text-slate-950' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}
        >
          <Icon size={17} />
          {active && <span>{label}</span>}
        </button>
      ))}
    </nav>
  )
}
