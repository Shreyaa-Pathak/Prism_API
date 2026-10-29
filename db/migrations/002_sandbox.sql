-- Explicit marker prevents accidentally publishing an ordinary workspace as a demo.
alter table workspaces add column is_sandbox boolean not null default false;
