import { Activity, Anchor, Boxes, Gauge, X } from 'lucide-react'

const operationsByPort: Record<string, Array<{ label: string; value: string; detail: string }>> = {
	'Gulfport Port': [
		{ label: 'Vessel Calls', value: '18', detail: '4 in berth' },
		{ label: 'Container Flow', value: '12.4K', detail: '+8.2% today' },
		{ label: 'Crane Utilization', value: '84%', detail: '6 active cranes' },
		{ label: 'Terminal Velocity', value: '32', detail: 'moves / hour' },
	],
	PortMiami: [
		{ label: 'Vessel Calls', value: '24', detail: '5 in berth · synthetic demo' },
		{ label: 'Container Flow', value: '8.7K', detail: '+3.4% today · synthetic demo' },
		{ label: 'Crane Utilization', value: '78%', detail: '12 active cranes · synthetic demo' },
		{ label: 'Terminal Velocity', value: '34', detail: 'moves / hour · synthetic demo' },
	],
	'Port of Los Angeles': [
		{ label: 'Vessel Calls', value: '74', detail: '12 in berth' },
		{ label: 'Container Flow', value: '28.5K', detail: '+5.1% today' },
		{ label: 'Crane Utilization', value: '91%', detail: '44 active cranes' },
		{ label: 'Terminal Velocity', value: '41', detail: 'moves / hour' },
	],
	'Port of Jacksonville': [
		{ label: 'Vessel Calls', value: '16', detail: '3 in berth' },
		{ label: 'Container Flow', value: '4.1K', detail: '+2.8% today' },
		{ label: 'Crane Utilization', value: '76%', detail: '8 active cranes' },
		{ label: 'Terminal Velocity', value: '29', detail: 'moves / hour' },
	],
	'Port of Oakland': [
		{ label: 'Vessel Calls', value: '27', detail: '5 in berth' },
		{ label: 'Container Flow', value: '6.3K', detail: '+1.9% today' },
		{ label: 'Crane Utilization', value: '79%', detail: '14 active cranes' },
		{ label: 'Terminal Velocity', value: '31', detail: 'moves / hour' },
	],
	'Port of Charleston': [
		{ label: 'Vessel Calls', value: '21', detail: '4 in berth' },
		{ label: 'Container Flow', value: '7.8K', detail: '+3.6% today' },
		{ label: 'Crane Utilization', value: '82%', detail: '11 active cranes' },
		{ label: 'Terminal Velocity', value: '34', detail: 'moves / hour' },
	],
	'Ports of Tacoma and Seattle': [
		{ label: 'Vessel Calls', value: '39', detail: '8 in berth' },
		{ label: 'Container Flow', value: '11.7K', detail: '+4.4% today' },
		{ label: 'Crane Utilization', value: '86%', detail: '22 active cranes' },
		{ label: 'Terminal Velocity', value: '36', detail: 'moves / hour' },
	],
	'Port of Virginia': [
		{ label: 'Vessel Calls', value: '29', detail: '6 in berth' },
		{ label: 'Container Flow', value: '10.2K', detail: '+4.7% today' },
		{ label: 'Crane Utilization', value: '88%', detail: '18 active cranes' },
		{ label: 'Terminal Velocity', value: '38', detail: 'moves / hour' },
	],
	'Port of Houston': [
		{ label: 'Vessel Calls', value: '47', detail: '9 in berth' },
		{ label: 'Container Flow', value: '14.9K', detail: '+3.1% today' },
		{ label: 'Crane Utilization', value: '89%', detail: '26 active cranes' },
		{ label: 'Terminal Velocity', value: '35', detail: 'moves / hour' },
	],
	'Port of Savannah': [
		{ label: 'Vessel Calls', value: '34', detail: '7 in berth' },
		{ label: 'Container Flow', value: '13.1K', detail: '+6.5% today' },
		{ label: 'Crane Utilization', value: '90%', detail: '20 active cranes' },
		{ label: 'Terminal Velocity', value: '39', detail: 'moves / hour' },
	],
	'Port of Long Beach': [
		{ label: 'Vessel Calls', value: '69', detail: '11 in berth' },
		{ label: 'Container Flow', value: '26.2K', detail: '+4.8% today' },
		{ label: 'Crane Utilization', value: '92%', detail: '40 active cranes' },
		{ label: 'Terminal Velocity', value: '40', detail: 'moves / hour' },
	],
	'Port of New York and New Jersey': [
		{ label: 'Vessel Calls', value: '52', detail: '10 in berth' },
		{ label: 'Container Flow', value: '21.8K', detail: '+5.3% today' },
		{ label: 'Crane Utilization', value: '88%', detail: '32 active cranes' },
		{ label: 'Terminal Velocity', value: '37', detail: 'moves / hour' },
	],
}

export default function MetricsPanel({ onClose, portName }: { onClose: () => void; portName: string }) {
	const portMetrics = operationsByPort[portName] ?? []
	const metricIcons = [Anchor, Boxes, Activity, Gauge]
	const metricColors = ['#38bdf8', '#2dd4cf', '#fbbf24', '#a78bfa']

	return (
		<aside className="pointer-events-auto absolute right-5 top-24 z-[1001] w-[280px] rounded-2xl border border-white/10 bg-[#10151c]/88 p-3 shadow-2xl backdrop-blur-xl">
			<div className="mb-3 flex items-start justify-between px-1">
				<div>
					<p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Illustrative operations · synthetic data</p>
					<h2 className="mt-1 text-sm font-semibold text-white">{portName}</h2>
				</div>
				<div className="flex items-center gap-1">
					<span className="flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-400">
						<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> DEMO
					</span>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close live operations"
						title="Close"
						className="rounded-lg p-1 text-slate-500 transition hover:bg-white/10 hover:text-white"
					>
						<X size={16} />
					</button>
				</div>
			</div>

			<div className="grid grid-cols-2 gap-2">
                {portMetrics.length === 0 && (
                  <p className="col-span-2 text-xs text-slate-400">No synthetic operations scenario configured for this location. AIS positions are shown separately on the map.</p>
                )}
				{portMetrics.map(({ label, value, detail }, index) => {
					const Icon = metricIcons[index]
					const color = metricColors[index]
					return (
						<div key={label} className="rounded-xl border border-white/[0.07] bg-white/[0.035] p-3">
							<Icon className="mb-3" size={17} style={{ color }} />
							<div className="text-xl font-semibold text-white">{value}</div>
							<div className="mt-0.5 text-[11px] font-medium text-slate-400">{label}</div>
							<div className="mt-1 text-[9px] text-slate-500">{detail}</div>
						</div>
					)
				})}
			</div>
		</aside>
	)
}
