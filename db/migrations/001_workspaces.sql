-- Preserve the pre-auth demo data without making it accessible to new accounts.
-- Nothing is assigned to a tenant based on the old, self-issued account cookie.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = current_schema() and table_name = 'projects')
     and not exists (select 1 from information_schema.columns where table_schema = current_schema() and table_name = 'projects' and column_name = 'workspace_id') then
    alter table deployments rename to legacy_demo_deployments;
    alter table projects rename to legacy_demo_projects;
    alter table users rename to legacy_demo_users;
    alter table api_keys rename to legacy_demo_api_keys;
    alter table usage_events rename to legacy_demo_usage_events;
  end if;
end $$;

create table users (
  id text primary key,
  name text not null check (length(name) between 1 and 100),
  email text not null unique check (email = lower(email)),
  password_hash text not null,
  created_at timestamptz not null default now()
);
create table workspaces (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);
create table workspace_members (
  workspace_id text not null references workspaces(id) on delete cascade,
  user_id text not null references users(id) on delete restrict,
  role text not null default 'owner' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index members_user on workspace_members(user_id);
create table sessions (
  hash text primary key,
  user_id text not null,
  workspace_id text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, user_id) references workspace_members(workspace_id,user_id) on delete cascade
);
create index sessions_expiry on sessions(expires_at);
create table projects (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  name text not null check (length(name) between 1 and 100),
  slug text not null check (length(slug) between 1 and 100),
  owner_id text not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, slug),
  foreign key (workspace_id,owner_id) references workspace_members(workspace_id,user_id) on delete restrict
);
create index tenant_projects_newest on projects(workspace_id,created_at desc,id desc);
create table deployments (
  id text primary key,
  workspace_id text not null,
  project_id text not null,
  status text not null check (status in ('QUEUED','BUILDING','READY','FAILED')),
  branch text not null check (length(branch) between 1 and 200),
  commit_sha text not null check (length(commit_sha) between 1 and 100),
  created_at timestamptz not null default now(),
  foreign key (workspace_id,project_id) references projects(workspace_id,id) on delete cascade
);
create index tenant_deployments_newest on deployments(workspace_id,project_id,created_at desc,id desc);
create table api_keys (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  prefix text not null,
  hash text not null unique,
  plan text not null check (plan in ('sandbox','standard')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  unique (workspace_id,id)
);
create index tenant_keys_workspace on api_keys(workspace_id,created_at desc);
create table usage_events (
  id bigserial primary key,
  workspace_id text not null,
  key_id text not null,
  at timestamptz not null default now(),
  route text not null,
  status int not null check (status between 100 and 599),
  latency_ms double precision not null check (latency_ms >= 0),
  foreign key (workspace_id,key_id) references api_keys(workspace_id,id) on delete cascade
);
create index tenant_usage_at on usage_events(workspace_id,at);
create index tenant_usage_key_at on usage_events(workspace_id,key_id,at);
-- Also used for credential-attempt limits; IDs contain hashes, never emails/tokens.
create table rate_buckets (
  id text primary key,
  tokens double precision not null check (tokens >= 0),
  updated_at timestamptz not null default now()
);
create index rate_buckets_updated on rate_buckets(updated_at);
create table if not exists observed_operations (
  hash text primary key,
  document text not null,
  first_seen timestamptz not null,
  last_seen timestamptz not null,
  count bigint not null default 1
);
create index if not exists observed_operations_last_seen on observed_operations(last_seen);
