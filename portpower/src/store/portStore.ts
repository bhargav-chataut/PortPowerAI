import { create } from 'zustand'

interface PortState {
  selectedShipId: string | null
  selectedContainerId: string | null
  simulationRunning: boolean
  selectShip: (shipId: string | null) => void
  selectContainer: (containerId: string | null) => void
  toggleSimulation: () => void
}

export const usePortStore = create<PortState>((set) => ({
  selectedShipId: null,
  selectedContainerId: null,
  simulationRunning: false,
  selectShip: (selectedShipId) => set({ selectedShipId }),
  selectContainer: (selectedContainerId) => set({ selectedContainerId }),
  toggleSimulation: () =>
    set((state) => ({ simulationRunning: !state.simulationRunning })),
}))
