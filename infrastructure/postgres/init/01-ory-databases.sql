-- Separate databases for the Ory services, created on first boot of an empty
-- postgres volume (docker-entrypoint-initdb.d runs once, only when the data
-- directory is empty — re-running `task up` does NOT re-run this).
--
-- Separate DATABASES rather than separate schemas in `artical`: each Ory service
-- runs its own migrations against what it believes is its own database, and
-- Keto in particular creates tables with names generic enough to collide. Kept
-- apart, a `drizzle-kit push` gone wrong cannot touch the identity store, and
-- `pg_dump artical` produces a content backup uncontaminated by session rows.
--
-- The application user owns them because this is a single-VPS deployment with
-- one Postgres and no separate DBA. If that ever changes, each service should
-- get its own role with rights to only its own database.

CREATE DATABASE kratos;
CREATE DATABASE hydra;
CREATE DATABASE keto;
