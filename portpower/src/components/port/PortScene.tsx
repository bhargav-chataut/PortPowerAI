import * as THREE from 'three'
import { Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { Line, OrbitControls, useTexture } from '@react-three/drei'
import Crane from './Crane'
import Ship from './Ship'

export type PortSceneProps = {
  showReference?: boolean
}

function AerialReference() {
  const texture = useTexture(`${import.meta.env.BASE_URL}assets/gulfport-aerial.jpg`)

  const image = texture.image as {
    width?: number
    height?: number
    naturalWidth?: number
    naturalHeight?: number
  }
  const imageWidth = image.naturalWidth || image.width || 4
  const imageHeight = image.naturalHeight || image.height || 3
  const width = 40
  const height = width / (imageWidth / imageHeight)

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial side={THREE.DoubleSide} toneMapped={false}>
        <texture
          attach="map"
          args={[
            texture.image, THREE.UVMapping,
            THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping,
            THREE.LinearFilter, THREE.LinearMipmapLinearFilter,
            THREE.RGBAFormat, THREE.UnsignedByteType, 8,
          ]}
          colorSpace={THREE.SRGBColorSpace}
          anisotropy={8}
          onUpdate={(map) => { map.needsUpdate = true }}
        />
      </meshBasicMaterial>
    </mesh>
  )
}

function HarborSurface() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
      <planeGeometry args={[100, 100, 48, 48]} />
      <meshPhysicalMaterial
        color="#126f9b"
        roughness={0.24}
        metalness={0.18}
        clearcoat={0.9}
        clearcoatRoughness={0.18}
      />
    </mesh>
  )
}

function TerminalFootprint({ showReference }: { showReference: boolean }) {
  const shape = useMemo(() => {
    const terminal = new THREE.Shape()
    terminal.moveTo(-20, -10.5)
    terminal.lineTo(-20, 12)
    terminal.lineTo(20, 12)
    terminal.lineTo(20, -3.8)
    terminal.lineTo(12.5, -5.2)
    terminal.lineTo(4, -7.8)
    terminal.lineTo(-7, -9.5)
    terminal.lineTo(-20, -10.5)
    return terminal
  }, [])

  const points = shape.getPoints(20).map((point) => [point.x, 0.18, point.y] as [number, number, number])

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]} receiveShadow>
        <shapeGeometry args={[shape]} />
        <meshStandardMaterial
          color="#30383d"
          roughness={0.92}
          transparent={showReference}
          opacity={showReference ? 0.82 : 1}
          polygonOffset
          polygonOffsetFactor={-2}
        />
      </mesh>
      <Line points={points} color="#fbbf24" lineWidth={1.35} transparent opacity={0.9} />
    </>
  )
}

function TerminalRoads() {
  const roads: Array<{ position: [number, number, number]; size: [number, number, number] }> = [
    { position: [-10, 0.16, 2.5], size: [19, 0.09, 1.25] },
    { position: [-5, 0.16, 7], size: [29, 0.09, 1.25] },
    { position: [-14, 0.16, -1.5], size: [1.25, 0.09, 13] },
    { position: [4, 0.16, 1], size: [1.25, 0.09, 13] },
    { position: [11, 0.16, 4.5], size: [17, 0.09, 1.25] },
  ]

  return (
    <group>
      {roads.map((road, index) => (
        <mesh key={index} position={road.position} receiveShadow>
          <boxGeometry args={road.size} />
          <meshStandardMaterial color="#596169" roughness={0.9} />
        </mesh>
      ))}
      {[...Array(8)].map((_, index) => (
        <mesh key={`dock-mark-${index}`} position={[-19 + index * 2.55, 0.27, -7.3]} receiveShadow>
          <boxGeometry args={[1.35, 0.025, 0.1]} />
          <meshStandardMaterial color="#d6d3d1" />
        </mesh>
      ))}
    </group>
  )
}

function Warehouse() {
  return (
    <group position={[13, 0.12, 8.2]}>
      <mesh position={[0, 1.25, 0]} castShadow receiveShadow>
        <boxGeometry args={[10, 2.5, 5]} />
        <meshStandardMaterial color="#d9dde0" roughness={0.78} />
      </mesh>
      <mesh position={[0, 2.55, 0]} castShadow>
        <boxGeometry args={[10.5, 0.16, 5.5]} />
        <meshStandardMaterial color="#adb5bb" roughness={0.82} />
      </mesh>
      {[-3.2, 0, 3.2].map((x) => (
        <mesh key={x} position={[x, 1.05, 2.52]}>
          <boxGeometry args={[1.8, 2.05, 0.08]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
      ))}
    </group>
  )
}

const containerColors = ['#159c91', '#2563eb', '#9333ea', '#334155', '#d97706']

function ContainerYards() {
  const yards = [-11.8, -9, -6.2, -3.4]

  return (
    <group>
      {yards.flatMap((z, row) =>
        Array.from({ length: 10 }, (_, column) => (
          <group key={`${row}-${column}`} position={[-17.2 + column * 1.75, 0.18, z]}>
            {[0, 1, 2, 3].slice(0, ((column * 5 + row * 3) % 4) + 1).map((level) => (
              <mesh key={level} position={[0, 0.42 + level * 0.78, 0]} castShadow receiveShadow>
                <boxGeometry args={[1.52, 0.72, 0.78]} />
                <meshStandardMaterial color={containerColors[(column + row + level) % containerColors.length]} roughness={0.68} metalness={0.08} />
              </mesh>
            ))}
          </group>
        ))
      )}

      {[0, 1, 2, 3].map((row) => (
        <group key={`reefer-${row}`} position={[6.2, 0.2, -9.5 + row * 1.05]}>
          {[-2, 0, 2, 4].map((column) => (
            <mesh key={column} position={[column, 0.42, 0]} castShadow>
              <boxGeometry args={[1.55, 0.72, 0.78]} />
              <meshStandardMaterial color="#e7e5e4" roughness={0.55} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

function PortBuildings() {
  const buildings = [-8, -2, 4]
  return (
    <group>
      {buildings.map((x, index) => (
        <group key={x} position={[x, 0, 8.9]}>
          <mesh position={[0, 0.65, 0]} castShadow receiveShadow>
            <boxGeometry args={[5, 1.3, 3.2]} />
            <meshStandardMaterial color={index === 1 ? '#d6d3d1' : '#cbd5e1'} roughness={0.72} />
          </mesh>
          <mesh position={[0, 1.34, 0]} castShadow>
            <boxGeometry args={[5.25, 0.12, 3.45]} />
            <meshStandardMaterial color="#64748b" metalness={0.25} roughness={0.55} />
          </mesh>
          {[-1.5, 0, 1.5].map((doorX) => (
            <mesh key={doorX} position={[doorX, 0.55, 1.61]}>
              <boxGeometry args={[0.8, 1.1, 0.08]} />
              <meshStandardMaterial color="#334155" />
            </mesh>
          ))}
        </group>
      ))}
      <Warehouse />
    </group>
  )
}

function BerthsAndServiceRoads() {
  return (
    <group>
      {[1.5, -1.5].map((x) => (
        <group key={x} position={[x, 0.12, -8.6]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[2.1, 0.28, 13]} />
            <meshStandardMaterial color="#8b9298" roughness={0.85} />
          </mesh>
          {[0, 2, 4, 6, 8, 10].map((z) => (
            <mesh key={z} position={[0, 0.17, -6 + z]}>
              <cylinderGeometry args={[0.3, 0.3, 0.62, 16]} />
              <meshStandardMaterial color="#d6d3d1" roughness={0.65} />
            </mesh>
          ))}
        </group>
      ))}
      <mesh position={[8.8, 0.12, -7]} receiveShadow castShadow>
        <boxGeometry args={[9, 0.22, 1.4]} />
        <meshStandardMaterial color="#737c82" roughness={0.9} />
      </mesh>
    </group>
  )
}

function YardVehicles() {
  return (
    <group>
      {[[-13, 5], [-7, 5], [0, 5], [7, 5], [-10, -4]].map(([x, z], index) => (
        <group key={index} position={[x, 0.3, z]} rotation={[0, index % 2 ? 0 : Math.PI / 2, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.8, 0.55, 1.7]} />
            <meshStandardMaterial color={index % 2 ? '#f59e0b' : '#dc2626'} />
          </mesh>
          <mesh position={[0, 0.4, 0.15]} castShadow>
            <boxGeometry args={[0.68, 0.38, 0.75]} />
            <meshStandardMaterial color="#e5e7eb" />
          </mesh>
          {[-0.43, 0.43].map((wheelX) => [-0.55, 0.55].map((wheelZ) => (
            <mesh key={`${wheelX}-${wheelZ}`} position={[wheelX, -0.25, wheelZ]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.16, 0.16, 0.12, 12]} />
              <meshStandardMaterial color="#111827" />
            </mesh>
          )))}
        </group>
      ))}
    </group>
  )
}

function NavigationLights() {
  return (
    <group>
      {[[-18.5, -12], [18.5, -8], [-18.5, 11], [18.5, 10]].map(([x, z], index) => (
        <group key={index} position={[x, 0, z]}>
          <mesh position={[0, 2.2, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.08, 4.4, 12]} />
            <meshStandardMaterial color="#334155" />
          </mesh>
          <mesh position={[0, 4.45, 0]}>
            <sphereGeometry args={[0.18, 16, 16]} />
            <meshStandardMaterial color="#fde047" emissive="#facc15" emissiveIntensity={3} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
function PortEnvironment({ showReference }: { showReference: boolean }) {
  return (
    <>
      <HarborSurface />
      {showReference && (
        <Suspense fallback={null}>
          <AerialReference />
        </Suspense>
      )}
      <TerminalFootprint showReference={showReference} />
      <TerminalRoads />
      <PortBuildings />
      <BerthsAndServiceRoads />
      <ContainerYards />
      <YardVehicles />
      <NavigationLights />
      <group position={[6, 0, -8]} scale={0.9}><Crane /></group>
      <group position={[10, 0, -8]} scale={0.9}><Crane /></group>
      <group position={[14, 0, -8]} scale={0.9}><Crane /></group>
      <group position={[18, 0, -7]} scale={0.9}><Crane /></group>
      <Ship position={[12, 0.22, -13]} rotation={[0, Math.PI / 2, 0]} />
      <Ship position={[-13, 0.22, -15]} rotation={[0, Math.PI / 2, 0]} />

      <ambientLight intensity={1.05} />
      <hemisphereLight intensity={0.65} color="#e0f2fe" groundColor="#082f49" />
      <directionalLight
        position={[18, 28, 12]}
        intensity={2.15}
        color="#fff7ed"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={28}
        shadow-camera-bottom={-28}
      />

      <OrbitControls
        target={[0, 0, 0]}
        enablePan
        enableZoom
        enableRotate
        minDistance={15}
        maxDistance={65}
        maxPolarAngle={Math.PI / 2.05}
      />
    </>
  )
}

export default function PortScene({ showReference = true }: PortSceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 34, 42], fov: 40 }}
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      shadows
    >
      <color attach="background" args={[showReference ? '#dcecf1' : '#0b1921']} />
      <fog attach="fog" args={['#090b10', 45, 75]} />
      <PortEnvironment showReference={showReference} />
    </Canvas>
  )
}
