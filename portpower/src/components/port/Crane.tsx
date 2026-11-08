type CraneProps = {
  position?: [number, number, number]
}

export default function Crane({ position = [0, 0, 0] }: CraneProps) {
  return (
    <group position={position}>
      {[-0.9, 0.9].map((x) => (
        <mesh key={x} position={[x, 2.8, 0]} castShadow>
          <boxGeometry args={[0.22, 5.6, 0.22]} />
          <meshStandardMaterial color="#eab308" />
        </mesh>
      ))}
      <mesh position={[0, 5.5, 0]} castShadow>
        <boxGeometry args={[3.1, 0.24, 0.24]} />
        <meshStandardMaterial color="#facc15" />
      </mesh>
      <mesh position={[0, 4.65, 0]} rotation={[0, 0, -0.09]} castShadow>
        <boxGeometry args={[0.22, 2.0, 0.22]} />
        <meshStandardMaterial color="#ca8a04" />
      </mesh>
      <mesh position={[1.05, 4.05, 0]} castShadow>
        <boxGeometry args={[0.55, 0.4, 0.55]} />
        <meshStandardMaterial color="#facc15" />
      </mesh>
      <mesh position={[1.05, 2.55, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 3, 8]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <mesh position={[1.05, 0.92, 0]} castShadow>
        <boxGeometry args={[0.7, 0.25, 0.7]} />
        <meshStandardMaterial color="#ef4444" />
      </mesh>
    </group>
  )
}
