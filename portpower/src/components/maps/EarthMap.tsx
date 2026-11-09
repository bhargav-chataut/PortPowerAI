import { useEffect, useState } from 'react'
import { MapContainer, Marker, TileLayer, Tooltip, ZoomControl, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Layers, Satellite, Map as MapIcon, X, ChevronDown, MapPin, Ship } from 'lucide-react'
import 'leaflet/dist/leaflet.css'

export const ports = [
  { name: 'Gulfport Port', coordinates: [30.365, -89.093] as [number, number] },
  { name: 'PortMiami', coordinates: [25.777, -80.172] as [number, number] },
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

function MapFollowPort({ port }: { port: (typeof ports)[number] }) {
  const map = useMap()
  useEffect(() => {
    map.flyTo(port.coordinates, port.name === 'Gulfport Port' || port.name === 'PortMiami' ? 12 : 11, { duration: 1 })
  }, [map, port])
  return null
}

const createVesselIcon = (course: number) => L.divIcon({
  className: 'vessel-marker-wrap',
  html: `<div class="vessel-marker" style="transform:rotate(${course}deg)"><span></span></div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
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
                  map.flyTo(port.coordinates, port.name === 'Gulfport Port' || port.name === 'PortMiami' ? 12 : 11, { duration: 1.2 })
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
  const [aisStatus, setAisStatus] = useState<'connecting' | 'live' | 'offline' | 'unsupported'>('connecting')
  const [lastUpdate, setLastUpdate] = useState<string>('')

  useEffect(() => {
    const region = selectedPortName === 'Gulfport Port'
      ? 'gulfport'
      : selectedPortName === 'PortMiami'
        ? 'miami'
        : null

    if (!region) {
      setVessels([])
      setAisStatus('unsupported')
      return
    }

    const baseEndpoint = (import.meta.env.VITE_AIS_API_URL as string | undefined)?.trim() || '/api/vessels'
    const endpoint = new URL(baseEndpoint, window.location.origin)
    endpoint.searchParams.set('region', region)
    let active = true
    setVessels([])
    setAisStatus('connecting')

    const refresh = async () => {
      try {
        const response = await fetch(endpoint.toString(), { headers: { Accept: 'application/json' } })
        if (!response.ok) throw new Error(`AIS feed returned ${response.status}`)
        const payload = await response.json()
        const items = Array.isArray(payload) ? payload : payload.vessels ?? payload.data ?? []
        if (!Array.isArray(items)) throw new Error('Invalid vessel API response')
        if (!active) return

        setVessels(items.map((item: Record<string, unknown>) => ({
          mmsi: String(item.mmsi ?? item.MMSI ?? ''),
          name: String(item.name ?? item.shipName ?? item.SHIPNAME ?? 'Unknown vessel'),
          latitude: Number(item.latitude ?? item.lat ?? item.LAT),
          longitude: Number(item.longitude ?? item.lon ?? item.LON),
          speed: Number(item.speedKnots ?? item.speed ?? item.speedOverGround ?? item.SPEED ?? 0),
          course: Number(item.course ?? item.courseOverGround ?? item.COURSE ?? 0),
          destination: item.destination ? String(item.destination) : undefined,
          timestamp: item.lastUpdated ? String(item.lastUpdated) : item.timestamp ? String(item.timestamp) : undefined,
        })).filter((vessel: VesselPosition) =>
          vessel.mmsi.length > 0 &&
          Number.isFinite(vessel.latitude) && Number.isFinite(vessel.longitude) &&
          vessel.latitude >= -90 && vessel.latitude <= 90 &&
          vessel.longitude >= -180 && vessel.longitude <= 180
        ))
        setAisStatus('live')
        setLastUpdate(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
      } catch {
        if (active) setAisStatus('offline')
      }
    }

    void refresh()
    const interval = window.setInterval(() => { void refresh() }, 30_000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [selectedPortName])

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
        <MapFollowPort port={selectedPort} />
        {ports.map((port) => (
          <Marker key={port.name} position={port.coordinates} icon={markerIcon} />
        ))}
        {vessels.map((vessel) => (
          <Marker
            key={vessel.mmsi || `${vessel.name}-${vessel.latitude}-${vessel.longitude}`}
            position={[vessel.latitude, vessel.longitude]}
            icon={createVesselIcon(vessel.course)}
          >
            <Tooltip direction="top" offset={[0, -14]} opacity={1}>
              <div className="vessel-tooltip">
                <strong>Name: {vessel.name}</strong>
                <span>MMSI: {vessel.mmsi || 'Unknown'}</span>
                <span>Speed: {vessel.speed.toFixed(1)} kn</span>
                <span>Course: {vessel.course.toFixed(0)}°</span>
                {vessel.destination && <span>Destination: {vessel.destination}</span>}
              </div>
            </Tooltip>
          </Marker>
        ))}
        <ZoomControl position="bottomright" />
        <MapControls labels={labels} setLabels={setLabels} layer={layer} setLayer={setLayer} selectedPort={selectedPort} selectPort={onSelectPort} />
      </MapContainer>

      <div className={`ais-map-status ais-${aisStatus}`}>
        <Ship size={16} />
        <span>
          <strong>{aisStatus === 'live' ? 'AIS API connected' : aisStatus === 'connecting' ? 'Connecting to vessel API' : aisStatus === 'unsupported' ? 'AIS not configured for this port' : 'AIS API unavailable'}</strong>
          <small>{aisStatus === 'live' ? `${vessels.length} received vessel positions · checked ${lastUpdate}` : aisStatus === 'unsupported' ? 'Gulfport and Miami monitoring available' : 'Start the vessel API or configure VITE_AIS_API_URL'}</small>
        </span>
      </div>
    </div>
  )
}
