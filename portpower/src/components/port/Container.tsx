export type ContainerProps = {
  position: [number, number, number]
  color: string
}

export default function Container({ position, color }: ContainerProps) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={[2, 0.8, 0.9]} />
      <meshStandardMaterial color={color} />
    </mesh>
  )
}
