-- Migration number: 0001 	 2026-11-07T14:51:42.956Z
-- Single-table influencer schema for Cloudflare D1 (SQLite).

CREATE TABLE influencers (
	id                INTEGER PRIMARY KEY AUTOINCREMENT,

	-- general info
	name              TEXT NOT NULL,
	bio               TEXT,
	email             TEXT,
	website_url       TEXT,
	gender            TEXT NOT NULL DEFAULT 'unknown'
	                  CHECK (gender IN ('male', 'female', 'other', 'unknown')),
	birth_date        TEXT, -- ISO 8601 date: YYYY-MM-DD

	-- location
	language          TEXT, -- BCP 47 code, e.g. "en", "pt-BR"
	region            TEXT, -- broad area, e.g. "Europe", "South America"
	country           TEXT, -- ISO 3166-1 alpha-2, e.g. "BR"
	city              TEXT,

	-- social account
	platform          TEXT NOT NULL
	                  CHECK (platform IN (
	                    'instagram', 'tiktok', 'youtube', 'x', 'facebook',
	                    'linkedin', 'twitch', 'snapchat', 'pinterest', 'other'
	                  )),
	handle            TEXT NOT NULL, -- without the leading "@"
	profile_url       TEXT,
	avatar_url        TEXT,
	is_verified       INTEGER NOT NULL DEFAULT 0
	                  CHECK (is_verified IN (0, 1)),

	-- current metrics
	followers         INTEGER NOT NULL DEFAULT 0 CHECK (followers >= 0),
	following         INTEGER NOT NULL DEFAULT 0 CHECK (following >= 0),
	total_posts       INTEGER NOT NULL DEFAULT 0 CHECK (total_posts >= 0),
	avg_likes         REAL CHECK (avg_likes >= 0),
	avg_comments      REAL CHECK (avg_comments >= 0),
	avg_views         REAL CHECK (avg_views >= 0),
	engagement_rate   REAL CHECK (engagement_rate >= 0), -- percentage, e.g. 3.71

	-- niche
	niche             TEXT, -- short label, e.g. "fitness"
	niche_description TEXT, -- free text embedded for semantic (vector) search

	created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

	UNIQUE (platform, handle)
);

CREATE INDEX idx_influencers_region   ON influencers (region);
CREATE INDEX idx_influencers_country  ON influencers (country);
CREATE INDEX idx_influencers_niche    ON influencers (niche);
CREATE INDEX idx_influencers_platform ON influencers (platform);
CREATE INDEX idx_influencers_followers ON influencers (followers DESC);

CREATE TRIGGER trg_influencers_updated_at
AFTER UPDATE ON influencers
FOR EACH ROW
BEGIN
	UPDATE influencers
	SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
	WHERE id = OLD.id;
END;
