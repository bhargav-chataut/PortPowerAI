-- Fictional planning records only. No dependency on the real AIS vessels table.
ALTER TABLE operating_scenarios
  ADD COLUMN IF NOT EXISTS relational_ready BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS berths (
  scenario_id TEXT NOT NULL REFERENCES operating_scenarios(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  synthetic BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic),
  PRIMARY KEY (scenario_id, id)
);
CREATE TABLE IF NOT EXISTS vessel_calls (
  scenario_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  berth_id TEXT NOT NULL,
  arrival_minute INTEGER NOT NULL CHECK (arrival_minute >= 0),
  departure_minute INTEGER NOT NULL CHECK (departure_minute <= 1440 AND departure_minute > arrival_minute),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  synthetic BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic),
  PRIMARY KEY (scenario_id, id),
  FOREIGN KEY (scenario_id, berth_id) REFERENCES berths(scenario_id, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS equipment (
  scenario_id TEXT NOT NULL REFERENCES operating_scenarios(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  kind TEXT NOT NULL CHECK (kind IN ('forklift', 'yard-tractor')),
  enabled BOOLEAN NOT NULL,
  available_from_minute INTEGER NOT NULL CHECK (available_from_minute >= 0),
  available_until_minute INTEGER NOT NULL CHECK (available_until_minute <= 1440 AND available_until_minute > available_from_minute),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  synthetic BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic),
  PRIMARY KEY (scenario_id, id)
);
CREATE TABLE IF NOT EXISTS cargo_tasks (
  scenario_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  vessel_call_id TEXT NOT NULL,
  start_minute INTEGER NOT NULL CHECK (start_minute >= 0),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0 AND start_minute + duration_minutes <= 1440),
  priority TEXT NOT NULL CHECK (priority IN ('high', 'normal', 'low')),
  required_kind TEXT NOT NULL CHECK (required_kind IN ('forklift', 'yard-tractor')),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  synthetic BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic),
  PRIMARY KEY (scenario_id, id),
  FOREIGN KEY (scenario_id, vessel_call_id) REFERENCES vessel_calls(scenario_id, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS task_equipment_assignments (
  scenario_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  equipment_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  synthetic BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic),
  PRIMARY KEY (scenario_id, task_id, equipment_id),
  FOREIGN KEY (scenario_id, task_id) REFERENCES cargo_tasks(scenario_id, id) ON DELETE CASCADE,
  FOREIGN KEY (scenario_id, equipment_id) REFERENCES equipment(scenario_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS vessel_calls_berth_idx ON vessel_calls(scenario_id, berth_id);
CREATE INDEX IF NOT EXISTS cargo_tasks_call_idx ON cargo_tasks(scenario_id, vessel_call_id);
CREATE INDEX IF NOT EXISTS task_equipment_equipment_idx ON task_equipment_assignments(scenario_id, equipment_id);
COMMENT ON TABLE berths IS 'Synthetic scenario berths, not official Gulfport infrastructure.';
COMMENT ON TABLE vessel_calls IS 'Fictional planned calls; separate from real AIS vessels.';
COMMENT ON TABLE equipment IS 'Synthetic equipment inventory and availability windows.';
COMMENT ON TABLE cargo_tasks IS 'Synthetic cargo workloads and scheduling assumptions.';
COMMENT ON TABLE task_equipment_assignments IS 'Fictional whole-task equipment reservations.';
