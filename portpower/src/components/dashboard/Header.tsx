export default function Header() {
  return (
    <header className="pointer-events-none absolute left-5 top-5 z-20 flex items-center gap-3">
      <div className="grid h-11 w-11 place-items-center rounded-xl border border-cyan-300/20 bg-[#10151c]/90 text-xl shadow-xl backdrop-blur-xl">
        ⚓
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-400">
          Port intelligence
        </p>
        <h1 className="text-lg font-semibold tracking-wide text-white">
          PortPower Control Center
        </h1>
        <p className="text-xs text-slate-400">
          Gulfport · Live aerial operations
        </p>
      </div>
    </header>
  )
}
