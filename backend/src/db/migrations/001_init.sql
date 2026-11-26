-- ShackPulse — initial schema
-- Internal project portfolio: who we work for, what we are delivering, who owns it, and how it is going.

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','manager','member','viewer')),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','rejected','disabled')),
  title         TEXT,                 -- job title, e.g. "Senior DevOps Engineer"
  department    TEXT,                 -- Platform, DevSecOps, Cloud, SRE, MLOps, Delivery
  location      TEXT,
  phone         TEXT,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE clients (
  id                 SERIAL PRIMARY KEY,
  name               TEXT NOT NULL UNIQUE,
  slug               TEXT NOT NULL UNIQUE,
  industry           TEXT NOT NULL,
  tier               TEXT NOT NULL DEFAULT 'standard' CHECK (tier IN ('strategic','key','standard')),
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('prospect','active','inactive')),
  city               TEXT,
  country            TEXT NOT NULL DEFAULT 'India',
  website            TEXT,
  account_manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE client_contacts (
  id         SERIAL PRIMARY KEY,
  client_id  INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  email      TEXT,
  phone      TEXT,
  role       TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE SEQUENCE project_code_seq START 1001;

CREATE TABLE projects (
  id            SERIAL PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE DEFAULT ('PRJ-' || nextval('project_code_seq')),
  name          TEXT NOT NULL,
  client_id     INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  owner_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  summary       TEXT,
  description   TEXT,
  category      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','active','on_hold','completed','cancelled')),
  health        TEXT NOT NULL DEFAULT 'green' CHECK (health IN ('green','amber','red')),
  priority      TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  tech_stack    TEXT[] NOT NULL DEFAULT '{}',
  start_date    DATE NOT NULL,
  due_date      DATE NOT NULL,
  completed_at  TIMESTAMPTZ,
  budget_hours  INTEGER NOT NULL DEFAULT 0 CHECK (budget_hours >= 0),
  contract_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  repo_url      TEXT,
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (due_date >= start_date)
);
CREATE INDEX projects_client_idx ON projects(client_id);
CREATE INDEX projects_owner_idx ON projects(owner_id);
CREATE INDEX projects_status_idx ON projects(status);

CREATE TABLE project_members (
  project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_role   TEXT NOT NULL DEFAULT 'Engineer',
  allocation_pct INTEGER NOT NULL DEFAULT 50 CHECK (allocation_pct BETWEEN 5 AND 100),
  joined_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX project_members_user_idx ON project_members(user_id);

CREATE TABLE milestones (
  id           SERIAL PRIMARY KEY,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  due_date     DATE NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done')),
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX milestones_project_idx ON milestones(project_id);

CREATE TABLE time_entries (
  id         SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  hours      NUMERIC(4,1) NOT NULL CHECK (hours > 0 AND hours <= 16),
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX time_entries_project_idx ON time_entries(project_id, entry_date);
CREATE INDEX time_entries_user_idx ON time_entries(user_id, entry_date);

-- Status updates, comments, risks and decisions posted on a project.
CREATE TABLE project_updates (
  id         SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kind       TEXT NOT NULL DEFAULT 'comment' CHECK (kind IN ('status','comment','risk','decision')),
  health     TEXT CHECK (health IN ('green','amber','red')),
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX project_updates_project_idx ON project_updates(project_id, created_at DESC);

-- Company-wide activity feed and audit trail.
CREATE TABLE activity (
  id         BIGSERIAL PRIMARY KEY,
  actor_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  summary    TEXT NOT NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  client_id  INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  meta       JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX activity_created_idx ON activity(created_at DESC);

CREATE TABLE notifications (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications(user_id, created_at DESC);
