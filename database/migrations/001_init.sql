-- 001_init.sql
-- Initial schema for F&B POS system.
-- Design notes:
--   * Primary keys are UUIDs (generated client- or server-side) so the POS
--     app can create orders while offline and sync later without ID
--     collisions. Human-facing sequence numbers (order_number) are separate.
--   * Every transactional/master table carries outlet_id, even though we
--     run a single outlet for now, so multi-outlet is a config change later,
--     not a migration rewrite.
--   * Money columns are NUMERIC(14,2) (Rupiah, no sub-cent amounts, but kept
--     as numeric to avoid float rounding issues).
--   * "Snapshot" columns (e.g. item_name_snapshot, unit_price_snapshot) copy
--     the value at time of sale so historical orders/reports don't change
--     when a menu item is later renamed or repriced.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =========================================================================
-- Outlets
-- =========================================================================

CREATE TABLE outlets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  address       TEXT,
  phone         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_outlets_updated_at
  BEFORE UPDATE ON outlets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =========================================================================
-- RBAC: users, roles, permissions
-- =========================================================================

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_outlet_id  UUID NOT NULL REFERENCES outlets(id),
  username        TEXT NOT NULL UNIQUE,
  full_name       TEXT NOT NULL,
  email           TEXT,
  phone           TEXT,
  password_hash   TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Which outlets a user is allowed to operate in (beyond home_outlet_id).
-- For single-outlet deployments this has at most one row per user.
CREATE TABLE user_outlet_access (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  outlet_id   UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, outlet_id)
);

CREATE TABLE roles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,       -- e.g. 'cashier', 'kitchen', 'manager', 'owner'
  name          TEXT NOT NULL,              -- display name
  description   TEXT,
  is_system     BOOLEAN NOT NULL DEFAULT false, -- system roles cannot be deleted
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Configurable permission catalogue (same pattern as ASP Sport's RBAC):
-- permissions are seeded, roles are mapped to them, and role assignment is
-- editable from the admin UI without a code change.
CREATE TABLE permissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,       -- e.g. 'menu.manage', 'order.create', 'report.view_business'
  module        TEXT NOT NULL,              -- grouping for the admin UI, e.g. 'menu', 'order', 'inventory', 'report'
  description   TEXT
);

CREATE TABLE role_permissions (
  role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id   UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id   UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

-- =========================================================================
-- Menu: categories, items, modifiers
-- =========================================================================

CREATE TABLE categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id     UUID NOT NULL REFERENCES outlets(id),
  name          TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (outlet_id, name)
);

CREATE TRIGGER trg_categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE menu_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id       UUID NOT NULL REFERENCES outlets(id),
  category_id     UUID REFERENCES categories(id),
  sku             TEXT,
  name            TEXT NOT NULL,
  description     TEXT,
  price           NUMERIC(14,2) NOT NULL CHECK (price >= 0),
  image_url       TEXT,
  track_stock     BOOLEAN NOT NULL DEFAULT true, -- if true, selling deducts ingredients via recipe_items
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_menu_items_outlet ON menu_items(outlet_id);
CREATE INDEX idx_menu_items_category ON menu_items(category_id);

CREATE TRIGGER trg_menu_items_updated_at
  BEFORE UPDATE ON menu_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Modifier groups, e.g. "Ukuran" (Regular/Large, pick 1) or "Topping" (pick 0-3)
CREATE TABLE modifier_groups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id     UUID NOT NULL REFERENCES outlets(id),
  name          TEXT NOT NULL,
  min_select    INTEGER NOT NULL DEFAULT 0,
  max_select    INTEGER NOT NULL DEFAULT 1,
  is_required   BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE modifiers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modifier_group_id   UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  price_delta         NUMERIC(14,2) NOT NULL DEFAULT 0, -- added to item price when selected
  is_active           BOOLEAN NOT NULL DEFAULT true,
  sort_order          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE menu_item_modifier_groups (
  menu_item_id        UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  modifier_group_id   UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (menu_item_id, modifier_group_id)
);

-- =========================================================================
-- Inventory & recipes (BOM / HPP)
-- =========================================================================

CREATE TABLE ingredients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id       UUID NOT NULL REFERENCES outlets(id),
  name            TEXT NOT NULL,
  unit            TEXT NOT NULL,          -- e.g. 'gram', 'ml', 'pcs'
  current_stock   NUMERIC(14,3) NOT NULL DEFAULT 0,
  min_stock       NUMERIC(14,3) NOT NULL DEFAULT 0,
  cost_per_unit   NUMERIC(14,4) NOT NULL DEFAULT 0, -- for HPP calculation, updated on purchase
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (outlet_id, name)
);

CREATE TRIGGER trg_ingredients_updated_at
  BEFORE UPDATE ON ingredients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Bill of materials: how much of each ingredient one unit of a menu item consumes.
CREATE TABLE recipe_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id    UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  ingredient_id   UUID NOT NULL REFERENCES ingredients(id),
  quantity        NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  UNIQUE (menu_item_id, ingredient_id)
);

-- Some modifiers also consume stock (e.g. "extra cheese").
CREATE TABLE modifier_recipe_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modifier_id     UUID NOT NULL REFERENCES modifiers(id) ON DELETE CASCADE,
  ingredient_id   UUID NOT NULL REFERENCES ingredients(id),
  quantity        NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  UNIQUE (modifier_id, ingredient_id)
);

-- Append-only ledger of every stock movement. current_stock on ingredients
-- is a cached total kept in sync by the application layer (or a trigger
-- later); this table is the source of truth / audit trail.
CREATE TABLE inventory_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id       UUID NOT NULL REFERENCES outlets(id),
  ingredient_id   UUID NOT NULL REFERENCES ingredients(id),
  type            TEXT NOT NULL CHECK (type IN ('purchase', 'sale_deduction', 'adjustment', 'waste')),
  quantity        NUMERIC(14,3) NOT NULL, -- positive = stock in, negative = stock out
  unit_cost       NUMERIC(14,4),          -- cost at time of transaction (purchases)
  reference_type  TEXT,                   -- e.g. 'order_item', 'manual'
  reference_id    UUID,
  notes           TEXT,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_txn_ingredient ON inventory_transactions(ingredient_id);
CREATE INDEX idx_inventory_txn_outlet ON inventory_transactions(outlet_id);

-- =========================================================================
-- Tables & sessions (dine-in)
-- =========================================================================

CREATE TABLE dining_tables (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id     UUID NOT NULL REFERENCES outlets(id),
  name          TEXT NOT NULL,             -- e.g. 'Meja 1', 'Bar 3'
  capacity      INTEGER NOT NULL DEFAULT 4,
  status        TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'reserved')),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (outlet_id, name)
);

-- A session represents "table occupied from open to close"; one session can
-- hold multiple orders (rounds) and is what a bill is settled against.
CREATE TABLE table_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id       UUID NOT NULL REFERENCES outlets(id),
  table_id        UUID REFERENCES dining_tables(id), -- null for takeaway/delivery
  order_type      TEXT NOT NULL DEFAULT 'dine_in' CHECK (order_type IN ('dine_in', 'takeaway', 'delivery')),
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  guest_count     INTEGER,
  opened_by       UUID REFERENCES users(id),
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at       TIMESTAMPTZ
);

CREATE INDEX idx_table_sessions_outlet_status ON table_sessions(outlet_id, status);

-- =========================================================================
-- Orders
-- =========================================================================

-- Atomic per-outlet-per-day counter for human-facing order numbers.
-- Incremented with INSERT ... ON CONFLICT DO UPDATE (no read-then-write
-- race), so concurrent orders from the same outlet never collide.
CREATE TABLE order_number_counters (
  outlet_id     UUID NOT NULL REFERENCES outlets(id),
  business_date DATE NOT NULL,
  counter       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (outlet_id, business_date)
);

CREATE TABLE orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id             UUID NOT NULL REFERENCES outlets(id),
  table_session_id      UUID REFERENCES table_sessions(id),
  order_number          TEXT NOT NULL,       -- human-facing, e.g. daily sequence 'A-0007'
  status                TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'cancelled')),
  subtotal              NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total        NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total              NUMERIC(14,2) NOT NULL DEFAULT 0,
  service_charge_total  NUMERIC(14,2) NOT NULL DEFAULT 0,
  grand_total           NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes                 TEXT,
  created_by            UUID REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (outlet_id, order_number)
);

CREATE INDEX idx_orders_outlet_status ON orders(outlet_id, status);
CREATE INDEX idx_orders_table_session ON orders(table_session_id);

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE order_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id          UUID REFERENCES menu_items(id),
  item_name_snapshot    TEXT NOT NULL,
  unit_price_snapshot   NUMERIC(14,2) NOT NULL,
  quantity              NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  notes                 TEXT,
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  line_total            NUMERIC(14,2) NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

CREATE TABLE order_item_modifiers (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id           UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  modifier_id             UUID REFERENCES modifiers(id),
  modifier_name_snapshot  TEXT NOT NULL,
  price_delta_snapshot    NUMERIC(14,2) NOT NULL DEFAULT 0
);

CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id),
  outlet_id       UUID NOT NULL REFERENCES outlets(id),
  method          TEXT NOT NULL CHECK (method IN ('cash', 'qris', 'card', 'transfer')),
  amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  reference_no    TEXT,
  received_by     UUID REFERENCES users(id),
  paid_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_order ON payments(order_id);

-- =========================================================================
-- Schema migration bookkeeping
-- =========================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  version       TEXT PRIMARY KEY,
  applied_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
