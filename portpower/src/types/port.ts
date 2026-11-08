export type Position3D = [number, number, number]

export type ContainerStatus = 'available' | 'reserved' | 'in-transit'

export interface PortContainer {
  id: string
  position: Position3D
  color: string
  status: ContainerStatus
}
