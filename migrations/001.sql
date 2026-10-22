CREATE TABLE clients (
 id TEXT PRIMARY KEY, label TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
 scope TEXT NOT NULL CHECK(scope IN ('all','personal','work')),
 read_private INTEGER NOT NULL CHECK(read_private IN (0,1)), revoked_at TEXT
) STRICT;
CREATE TABLE sessions (
 id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id), label TEXT NOT NULL,
 created_at TEXT NOT NULL
) STRICT;
CREATE TABLE projects (
 id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 scope TEXT NOT NULL CHECK(scope IN ('personal','work')),
 completion_rule TEXT NOT NULL CHECK(completion_rule IN ('evidence','production_release')),
 version INTEGER NOT NULL DEFAULT 1, archived_at TEXT
) STRICT;
CREATE TABLE tasks (
 id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, project_id TEXT NOT NULL REFERENCES projects(id),
 title TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('todo','in_progress','blocked','done')),
 completion_evidence TEXT, version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
 owner_session_id TEXT REFERENCES sessions(id), generation INTEGER NOT NULL DEFAULT 1 CHECK(generation>=1),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT
) STRICT;
CREATE INDEX tasks_project ON tasks(project_id,id);
CREATE TABLE checklist_items (
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), text TEXT NOT NULL,
 position INTEGER NOT NULL, done INTEGER NOT NULL CHECK(done IN (0,1)), UNIQUE(task_id,position)
) STRICT;
CREATE TABLE checkpoints (
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), task_version INTEGER NOT NULL,
 session_id TEXT NOT NULL REFERENCES sessions(id), done TEXT NOT NULL, next TEXT NOT NULL,
 blocker TEXT NOT NULL, decisions TEXT NOT NULL, evidence_json TEXT NOT NULL,
 checklist_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(task_id,task_version)
) STRICT;
CREATE TABLE private_notes (
 checkpoint_id TEXT PRIMARY KEY REFERENCES checkpoints(id), body TEXT NOT NULL
) STRICT;
CREATE TABLE operations (
 principal_id TEXT NOT NULL, operation_id TEXT NOT NULL, request_hash TEXT NOT NULL,
 response_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(principal_id,operation_id)
) STRICT;
CREATE TRIGGER checkpoints_no_update BEFORE UPDATE ON checkpoints BEGIN SELECT RAISE(ABORT,'immutable checkpoint'); END;
CREATE TRIGGER checkpoints_no_delete BEFORE DELETE ON checkpoints BEGIN SELECT RAISE(ABORT,'immutable checkpoint'); END;
CREATE TRIGGER notes_no_update BEFORE UPDATE ON private_notes BEGIN SELECT RAISE(ABORT,'immutable note'); END;
CREATE TRIGGER notes_no_delete BEFORE DELETE ON private_notes BEGIN SELECT RAISE(ABORT,'immutable note'); END;
