-- Migration number: 0002 	 2026-11-08T00:00:00.000Z
-- Accounts, sessions, request-quota tracking, and DOKU checkout orders.

CREATE TABLE users (
	id                INTEGER PRIMARY KEY AUTOINCREMENT,
	email             TEXT NOT NULL COLLATE NOCASE UNIQUE,
	name              TEXT NOT NULL,
	password_hash     TEXT NOT NULL, -- pbkdf2$<iterations>$<salt>$<hash>
	quota_remaining   INTEGER NOT NULL DEFAULT 100 CHECK (quota_remaining >= 0),
	created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE sessions (
	id                INTEGER PRIMARY KEY AUTOINCREMENT,
	token_hash        TEXT NOT NULL UNIQUE, -- SHA-256 of the cookie token
	user_id           INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	expires_at        TEXT NOT NULL,
	created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_sessions_user_id ON sessions (user_id);
CREATE INDEX idx_sessions_expires_at ON sessions (expires_at);

CREATE TABLE api_requests (
	id                INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id           INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	endpoint          TEXT NOT NULL,
	method            TEXT NOT NULL,
	status_code       INTEGER NOT NULL,
	quota_before      INTEGER NOT NULL,
	quota_after       INTEGER NOT NULL,
	created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_api_requests_user_created ON api_requests (user_id, id DESC);

CREATE TABLE orders (
	id                INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id           INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	invoice_number    TEXT NOT NULL UNIQUE,
	amount            INTEGER NOT NULL CHECK (amount > 0), -- IDR, no decimals
	quota_amount      INTEGER NOT NULL CHECK (quota_amount > 0),
	status            TEXT NOT NULL DEFAULT 'PENDING'
	                  CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'EXPIRED')),
	payment_url       TEXT,
	doku_token_id     TEXT,
	created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	paid_at           TEXT,
	credited_at       TEXT -- when the quota was added (idempotency guard)
);

CREATE INDEX idx_orders_user_created ON orders (user_id, id DESC);
CREATE INDEX idx_orders_status ON orders (status);
