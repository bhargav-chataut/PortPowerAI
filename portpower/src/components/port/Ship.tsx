type ShipProps = {
  position?: [number, number, number]
  rotation?: [number, number, number]
}

export default function Ship({ position = [0, 0, 0], rotation = [0, 0, 0] }: ShipProps) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.2, 0.9, 11]} />
        <meshStandardMaterial color="#4b5563" />
      </mesh>
      <mesh position={[0, 1.12, 3.8]} castShadow>
        <boxGeometry args={[2.5, 0.45, 2]} />
        <meshStandardMaterial color="#d1d5db" />
      </mesh>
      <mesh position={[0, 1.65, 4.15]} castShadow>
        <boxGeometry args={[1.35, 0.7, 1.15]} />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>
      <mesh position={[0, 0.95, -4.9]} rotation={[Math.PI / 4, 0, 0]} castShadow>
        <coneGeometry args={[1.55, 1.4, 4]} />
        <meshStandardMaterial color="#374151" />
      </mesh>
      <mesh position={[0.62, 2.15, 4.15]} castShadow>
        <cylinderGeometry args={[0.16, 0.16, 1.1, 12]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      {[-3, -1, 1, 3].map((z) => (
        <mesh key={z} position={[0, 1.15, z]} castShadow>
          <boxGeometry args={[2.35, 0.65, 1.45]} />
          <meshStandardMaterial color={["#159c91", "#2563eb", "#9333ea", "#334155"][(z + 4) % 4]} />
        </mesh>
      ))}
    </group>
  )
}
