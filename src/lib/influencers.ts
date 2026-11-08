import type { D1Database } from './env'
import type { YouTubeChannel } from './youtube'

export interface InfluencerRecord {
  id: number
  name: string
  bio: string | null
  platform: string
  handle: string
  profileUrl: string | null
  avatarUrl: string | null
  country: string | null
  followers: number
  totalPosts: number
  isVerified: number
  createdAt: string
  updatedAt: string
}

const UPSERT_SQL = `
  INSERT INTO influencers (
    name, bio, platform, handle, profile_url, avatar_url,
    country, followers, total_posts, is_verified
  )
  VALUES (?, ?, 'youtube', ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (platform, handle) DO UPDATE SET
    name        = excluded.name,
    bio         = excluded.bio,
    profile_url = excluded.profile_url,
    avatar_url  = excluded.avatar_url,
    country     = excluded.country,
    followers   = excluded.followers,
    total_posts = excluded.total_posts,
    is_verified = excluded.is_verified
`

/** Inserts or refreshes the given channels, keyed by the `(platform, handle)` unique index. */
export async function upsertYouTubeChannels(
  db: D1Database,
  channels: YouTubeChannel[],
): Promise<void> {
  if (channels.length === 0) {
    return
  }

  const statement = db.prepare(UPSERT_SQL)

  await db.batch(
    channels.map((channel) =>
      statement.bind(
        channel.title,
        channel.description,
        channel.handle,
        channel.profileUrl,
        channel.avatarUrl,
        channel.country,
        channel.followers,
        channel.totalPosts,
        channel.isVerified,
      ),
    ),
  )
}

export const INFLUENCER_SORT_COLUMNS = {
  followers: 'followers',
  totalPosts: 'total_posts',
  engagementRate: 'engagement_rate',
  name: 'name',
  updatedAt: 'updated_at',
} as const

export type InfluencerSortField = keyof typeof INFLUENCER_SORT_COLUMNS

export interface InfluencerQuery {
  search?: string
  platform?: string
  country?: string
  region?: string
  niche?: string
  minFollowers?: number
  maxFollowers?: number
  verifiedOnly?: boolean
  sortBy?: InfluencerSortField
  sortDirection?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export interface InfluencerQueryRecord {
  id: number
  name: string
  bio: string | null
  email: string | null
  websiteUrl: string | null
  gender: string
  birthDate: string | null
  language: string | null
  region: string | null
  country: string | null
  city: string | null
  platform: string
  handle: string
  profileUrl: string | null
  avatarUrl: string | null
  isVerified: number
  followers: number
  following: number
  totalPosts: number
  avgLikes: number | null
  avgComments: number | null
  avgViews: number | null
  engagementRate: number | null
  niche: string | null
  nicheDescription: string | null
  createdAt: string
  updatedAt: string
}

const QUERY_COLUMNS = `
  id,
  name,
  bio,
  email,
  website_url AS websiteUrl,
  gender,
  birth_date  AS birthDate,
  language,
  region,
  country,
  city,
  platform,
  handle,
  profile_url AS profileUrl,
  avatar_url  AS avatarUrl,
  is_verified AS isVerified,
  followers,
  following,
  total_posts AS totalPosts,
  avg_likes   AS avgLikes,
  avg_comments AS avgComments,
  avg_views   AS avgViews,
  engagement_rate AS engagementRate,
  niche,
  niche_description AS nicheDescription,
  created_at  AS createdAt,
  updated_at  AS updatedAt
`

/** Runs a parameterised, read-only query against the `influencers` table. */
export async function queryInfluencers(
  db: D1Database,
  query: InfluencerQuery = {},
): Promise<InfluencerQueryRecord[]> {
  const conditions: string[] = []
  const params: unknown[] = []

  if (query.search) {
    const pattern = `%${query.search}%`
    conditions.push(
      '(name LIKE ? OR handle LIKE ? OR bio LIKE ? OR niche LIKE ? OR niche_description LIKE ?)',
    )
    params.push(pattern, pattern, pattern, pattern, pattern)
  }

  if (query.platform) {
    conditions.push('platform = ?')
    params.push(query.platform)
  }

  if (query.country) {
    conditions.push('country = ?')
    params.push(query.country)
  }

  if (query.region) {
    conditions.push('region = ?')
    params.push(query.region)
  }

  if (query.niche) {
    conditions.push('niche = ?')
    params.push(query.niche)
  }

  if (query.minFollowers !== undefined) {
    conditions.push('followers >= ?')
    params.push(query.minFollowers)
  }

  if (query.maxFollowers !== undefined) {
    conditions.push('followers <= ?')
    params.push(query.maxFollowers)
  }

  if (query.verifiedOnly) {
    conditions.push('is_verified = 1')
  }

  const sortColumn = INFLUENCER_SORT_COLUMNS[query.sortBy ?? 'followers']
  const sortDirection = query.sortDirection === 'asc' ? 'ASC' : 'DESC'
  const limit = Math.min(Math.max(query.limit ?? 10, 1), 50)
  const offset = Math.max(query.offset ?? 0, 0)

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const { results } = await db
    .prepare(
      `SELECT ${QUERY_COLUMNS}
       FROM influencers
       ${whereClause}
       ORDER BY ${sortColumn} ${sortDirection}, name ASC
       LIMIT ? OFFSET ?`,
    )
    .bind(...params, limit, offset)
    .all<InfluencerQueryRecord>()

  return results ?? []
}

/** Reads a single influencer row by its database id. */
export async function findInfluencerById(
  db: D1Database,
  id: number,
): Promise<InfluencerQueryRecord | null> {
  return db
    .prepare(`SELECT ${QUERY_COLUMNS} FROM influencers WHERE id = ?`)
    .bind(id)
    .first<InfluencerQueryRecord>()
}

/** Reads back the stored rows for the given YouTube handles, highest follower count first. */
export async function findYouTubeChannels(
  db: D1Database,
  handles: string[],
): Promise<InfluencerRecord[]> {
  if (handles.length === 0) {
    return []
  }

  const placeholders = handles.map(() => '?').join(', ')

  const { results } = await db
    .prepare(
      `SELECT
         id,
         name,
         bio,
         platform,
         handle,
         profile_url AS profileUrl,
         avatar_url  AS avatarUrl,
         country,
         followers,
         total_posts AS totalPosts,
         is_verified AS isVerified,
         created_at  AS createdAt,
         updated_at  AS updatedAt
       FROM influencers
       WHERE platform = 'youtube' AND handle IN (${placeholders})
       ORDER BY followers DESC, name ASC`,
    )
    .bind(...handles)
    .all<InfluencerRecord>()

  return results ?? []
}
