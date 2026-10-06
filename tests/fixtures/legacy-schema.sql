-- Original Prism demo schema, including its existing constraints/indexes.
create table users(id text primary key,name text not null,email text not null,created_at timestamptz not null);
create table projects(id text primary key,name text not null,slug text not null unique,owner_id text not null references users(id),created_at timestamptz not null);
create index projects_newest on projects(created_at desc,id desc);
create table deployments(id text primary key,project_id text not null references projects(id),status text not null,branch text not null,commit_sha text not null,created_at timestamptz not null);
create index deployments_project_newest on deployments(project_id,created_at desc,id desc);
create table api_keys(id text primary key,account_id text not null,name text not null,prefix text not null,hash text not null unique,plan text not null,created_at timestamptz not null default now(),last_used_at timestamptz,revoked_at timestamptz);
create index api_keys_account on api_keys(account_id);
create table usage_events(id bigserial primary key,key_id text not null,at timestamptz not null,route text not null,status int not null,latency_ms real not null);
create index usage_events_key_at on usage_events(key_id,at);
create table observed_operations(hash text primary key,document text not null,first_seen timestamptz not null,last_seen timestamptz not null,count bigint not null default 1);
create index observed_operations_last_seen on observed_operations(last_seen);
insert into users values('usr_demo','Demo','demo@example.test',now());
insert into projects values('prj_demo','Demo','demo','usr_demo',now());
