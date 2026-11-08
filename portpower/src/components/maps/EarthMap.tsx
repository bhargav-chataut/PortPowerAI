import { useEffect, useState } from 'react'
import { MapContainer, Marker, TileLayer, ZoomControl, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Layers, Satellite, Map as MapIcon, X, ChevronDown, MapPin, Ship } from 'lucide-react'
import 'leaflet/dist/leaflet.css'

export const ports = [
  { name: 'Gulfport Port', coordinates: [30.365, -89.093] as [number, number] },
  { name: 'Port of Los Angeles', coordinates: [33.7405, -118.2765] as [number, number] },
  { name: 'Port of Jacksonville', coordinates: [30.324, -81.653] as [number, number] },
  { name: 'Port of Oakland', coordinates: [37.795, -122.274] as [number, number] },
  { name: 'Port of Charleston', coordinates: [32.794, -79.923] as [number, number] },
  { name: 'Ports of Tacoma and Seattle', coordinates: [47.44, -122.39] as [number, number] },
  { name: 'Port of Virginia', coordinates: [36.8508, -76.289] as [number, number] },
  { name: 'Port of Houston', coordinates: [29.740, -95.020] as [number, number] },
  { name: 'Port of Savannah', coordinates: [32.081, -81.088] as [number, number] },
  { name: 'Port of Long Beach', coordinates: [33.754, -118.216] as [number, number] },
  { name: 'Port of New York and New Jersey', coordinates: [40.668, -74.145] as [number, number] },
]

const gulfport = L.latLng(30.365, -89.093)

const markerIcon = L.divIcon({
  className: 'port-marker-wrap',
  html: '<div class="port-marker"><span>⚓</span></div>',
  iconSize: [44, 44],
  iconAnchor: [22, 22],
})

type VesselPosition = {
  mmsi: string
  name: string
  latitude: number
  longitude: number
  speed: number
  course: number
  destination?: string
  timestamp?: string
}

const vesselIcon = L.divIcon({
  className: 'vessel-marker-wrap',
  html: '<div class="vessel-marker"><span></span></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
})

function MapControls({
  labels,
  setLabels,
  layer,
  setLayer,
  selectedPort,
  selectPort,
}: {
  labels: boolean
  setLabels: (value: boolean) => void
  layer: 'satellite' | 'map'
  setLayer: (value: 'satellite' | 'map') => void
  selectedPort: (typeof ports)[number]
  selectPort: (portName: string) => void
}) {
  const map = useMap()
  const [portsOpen, setPortsOpen] = useState(true)
  const [layersOpen, setLayersOpen] = useState(true)

  return (
    <>
      {portsOpen ? (
        <div
          className="earth-port-stack"
          onWheel={(event) => {
            event.stopPropagation()
          }}
          onMouseDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
        >
          <button className="earth-port-heading" onClick={() => setPortsOpen(false)} type="button">
            <span><MapPin size={15} /> {selectedPort.name}</span>
            <X size={15} />
          </button>
          <div className="earth-port-list">
            {ports.map((port) => (
              <button
                key={port.name}
                type="button"
                className={selectedPort.name === port.name ? 'active' : ''}
                onClick={() => {
                  selectPort(port.name)
                  map.flyTo(port.coordinates, port.name === 'Gulfport Port' ? 13 : 11, { duration: 1.2 })
                }}
              >
                <MapPin size={14} /> {port.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button className="earth-port-launcher" onClick={() => setPortsOpen(true)} type="button">
          <span className="earth-port-launcher-label">Port selector</span>
          <MapPin size={16} /> {selectedPort.name} <ChevronDown size={15} />
        </button>
      )}

      {layersOpen ? (
        <div className="earth-layers">
          <div className="earth-layers-header">
            <span>Map layers</span>
            <button className="earth-layers-close" onClick={() => setLayersOpen(false)} type="button" title="Close map layers" aria-label="Close map layers">
              <X size={15} />
            </button>
          </div>
          <button className={layer === 'satellite' ? 'active' : ''} onClick={() => setLayer('satellite')} type="button">
            <Satellite size={17} /> Satellite
          </button>
          <button className={layer === 'map' ? 'active' : ''} onClick={() => setLayer('map')} type="button">
            <MapIcon size={17} /> Map
          </button>
          <button className={labels ? 'active' : ''} onClick={() => setLabels(!labels)} type="button">
            <Layers size={17} /> Labels
          </button>
        </div>
      ) : (
        <button className="earth-layers-launcher" onClick={() => setLayersOpen(true)} type="button">
          <Layers size={16} /> Layers
        </button>
      )}
    </>
  )
}

export default function EarthMap({
  selectedPortName,
  onSelectPort,
}: {
  selectedPortName: string
  onSelectPort: (portName: string) => void
}) {
  const [labels, setLabels] = useState(true)
  const [layer, setLayer] = useState<'satellite' | 'map'>('satellite')
  const selectedPort = ports.find((port) => port.name === selectedPortName) ?? ports[0]
  const [vessels, setVessels] = useState<VesselPosition[]>([])
  const [aisStatus, setAisStatus] = useState<'connecting' | 'live' | 'offline'>('connecting')
  const [lastUpdate, setLastUpdate] = useState<string>('')

  useEffect(() => {
    const endpoint = import.meta.env.VITE_AIS_API_URL as string | undefined
    if (!endpoint) {
      setAisStatus('offline')
      return
    }

    let active = true
    const refresh = async () => {
      try {
        const response = await fetch(endpoint, { headers: { Accept: 'application/json' } })
        if (!response.ok) throw new Error(`AIS feed returned ${response.status}`)
        const payload = await response.json()
        const items = Array.isArray(payload) ? payload : payload.vessels ?? payload.data ?? []
        if (!active) return
        setVessels(items.map((item: Record<string, unknown>) => ({
          mmsi: String(item.mmsi ?? item.MMSI ?? ''),
          name: String(item.name ?? item.shipName ?? item.SHIPNAME ?? 'Unknown vessel'),
          latitude: Number(item.latitude ?? item.lat ?? item.LAT),
          longitude: Number(item.longitude ?? item.lon ?? item.LON),
          speed: Number(item.speed ?? item.speedOverGround ?? item.SPEED ?? 0),
          course: Number(item.course ?? item.courseOverGround ?? item.COURSE ?? 0),
          destination: item.destination ? String(item.destination) : undefined,
          timestamp: item.timestamp ? String(item.timestamp) : undefined,
        })).filter((vessel: VesselPosition) => Number.isFinite(vessel.latitude) && Number.isFinite(vessel.longitude)))
        setAisStatus('live')
        setLastUpdate(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
      } catch {
        if (active) setAisStatus('offline')
      }
    }

    refresh()
    const interval = window.setInterval(refresh, 30_000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [])

  return (
    <div className="earth-map">
      <MapContainer
        center={gulfport}
        zoom={13}
        minZoom={3}
        maxZoom={19}
        scrollWheelZoom
        zoomControl={false}
        attributionControl
        className="h-full w-full"
      >
        <TileLayer
          url={layer === 'satellite'
            ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
            : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
          attribution={layer === 'satellite' ? 'Tiles © Esri' : '© OpenStreetMap'}
          maxZoom={19}
        />
        {labels && (
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
            attribution="Esri"
            opacity={0.95}
          />
        )}
        {ports.map((port) => (
          <Marker key={port.name} position={port.coordinates} icon={markerIcon} />
        ))}
        {vessels.map((vessel) => (
          <Marker
            key={vessel.mmsi || `${vessel.name}-${vessel.latitude}-${vessel.longitude}`}
            position={[vessel.latitude, vessel.longitude]}
            icon={vesselIcon}
          />
        ))}
        <ZoomControl position="bottomright" />
        <MapControls labels={labels} setLabels={setLabels} layer={layer} setLayer={setLayer} selectedPort={selectedPort} selectPort={onSelectPort} />
      </MapContainer>

      <div className={`ais-map-status ais-${aisStatus}`}>
        <Ship size={16} />
        <span>
          <strong>{aisStatus === 'live' ? 'Live AIS vessels' : aisStatus === 'connecting' ? 'Connecting AIS' : 'AIS unavailable'}</strong>
          <small>{aisStatus === 'live' ? `${vessels.length} vessels · updated ${lastUpdate}` : 'Configure VITE_AIS_API_URL'}</small>
        </span>
      </div>
    </div>
  )
}
