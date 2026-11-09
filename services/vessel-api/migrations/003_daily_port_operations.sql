
-- PortPower AI
-- Daily operations entered by port managers
-- Separate from the existing simulation scenario tables.

BEGIN;

-- 1. Manager-owned berth inventory
CREATE TABLE IF NOT EXISTS manager_berths (
    id BIGSERIAL PRIMARY KEY,

    port_id BIGINT NOT NULL
        REFERENCES ports(id) ON DELETE CASCADE,

    berth_number INTEGER NOT NULL
        CHECK (berth_number > 0),

    name VARCHAR(100) NOT NULL,

    max_length_m NUMERIC(10,2)
        CHECK (max_length_m > 0),

    max_draft_m NUMERIC(8,2)
        CHECK (max_draft_m > 0),

    status VARCHAR(20) NOT NULL
        DEFAULT 'available'
        CHECK (
            status IN (
                'available',
                'occupied',
                'maintenance',
                'closed'
            )
        ),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(port_id, berth_number),
    UNIQUE(port_id, id)
);


-- 2. Equipment owned by each port
CREATE TABLE IF NOT EXISTS manager_equipment (
    id BIGSERIAL PRIMARY KEY,

    port_id BIGINT NOT NULL
        REFERENCES ports(id) ON DELETE CASCADE,

    equipment_code VARCHAR(40) NOT NULL,

    equipment_type VARCHAR(40) NOT NULL
        CHECK (
            equipment_type IN (
                'forklift',
                'reach_stacker',
                'mobile_crane',
                'gantry_crane',
                'terminal_tractor'
            )
        ),

    capacity_tonnes NUMERIC(10,2)
        CHECK (capacity_tonnes > 0),

    energy_type VARCHAR(20)
        CHECK (
            energy_type IN (
                'diesel',
                'electric',
                'hybrid'
            )
        ),

    status VARCHAR(20) NOT NULL
        DEFAULT 'available'
        CHECK (
            status IN (
                'available',
                'in_use',
                'maintenance',
                'out_of_service'
            )
        ),

    assigned_berth_id BIGINT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(port_id, equipment_code),

    FOREIGN KEY (port_id, assigned_berth_id)
        REFERENCES manager_berths(port_id, id)
);


-- 3. Planned arrivals registered by a manager
CREATE TABLE IF NOT EXISTS manager_vessel_arrivals (
    id BIGSERIAL PRIMARY KEY,

    port_id BIGINT NOT NULL
        REFERENCES ports(id) ON DELETE CASCADE,

    mmsi VARCHAR(9) NOT NULL
        CHECK (mmsi ~ '^[0-9]{9}$'),

    vessel_name VARCHAR(150),

    planned_eta TIMESTAMPTZ NOT NULL,

    cargo_type VARCHAR(30) NOT NULL
        CHECK (
            cargo_type IN (
                'containers',
                'general',
                'bulk',
                'roro'
            )
        ),

    workload_quantity NUMERIC(12,2) NOT NULL
        CHECK (workload_quantity > 0),

    workload_unit VARCHAR(20) NOT NULL
        CHECK (
            workload_unit IN (
                'container_moves',
                'tonnes',
                'vehicle_moves'
            )
        ),

    estimated_service_hours NUMERIC(8,2)
        CHECK (estimated_service_hours > 0),

    preferred_berth_id BIGINT,

    status VARCHAR(20) NOT NULL
        DEFAULT 'planned'
        CHECK (
            status IN (
                'planned',
                'arrived',
                'in_service',
                'completed',
                'cancelled'
            )
        ),

    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    FOREIGN KEY (port_id, preferred_berth_id)
        REFERENCES manager_berths(port_id, id),

    CHECK (
        (cargo_type = 'containers'
            AND workload_unit = 'container_moves')
        OR
        (cargo_type = 'roro'
            AND workload_unit = 'vehicle_moves')
        OR
        (cargo_type IN ('general', 'bulk')
            AND workload_unit = 'tonnes')
    )
);


-- Useful indexes
CREATE INDEX IF NOT EXISTS idx_manager_equipment_port
    ON manager_equipment(port_id, status);

CREATE INDEX IF NOT EXISTS idx_manager_berths_port
    ON manager_berths(port_id, status);

CREATE INDEX IF NOT EXISTS idx_manager_arrivals_port_eta
    ON manager_vessel_arrivals(port_id, planned_eta);

CREATE INDEX IF NOT EXISTS idx_manager_arrivals_mmsi
    ON manager_vessel_arrivals(mmsi);

COMMIT;
