const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'

export class YouTubeError extends Error {
  readonly code: string
  readonly status: 400 | 502 | 503

  constructor(message: string, code: string, status: 400 | 502 | 503 = 502) {
    super(message)
    this.name = 'YouTubeError'
    this.code = code
    this.status = status
  }
}

export interface YouTubeChannel {
  channelId: string
  title: string
  handle: string
  description: string | null
  avatarUrl: string | null
  profileUrl: string
  country: string | null
  followers: number
  totalPosts: number
  isVerified: 0 | 1
}

export interface SearchOptions {
  maxResults?: number
  regionCode?: string
  relevanceLanguage?: string
}

interface SearchListResponse {
  items?: {
    id?: { channelId?: string }
  }[]
  error?: YouTubeErrorBody['error']
}

interface ChannelListResponse {
  items?: {
    id?: string
    snippet?: {
      title?: string
      description?: string
      customUrl?: string
      country?: string
      thumbnails?: Record<string, { url?: string }>
    }
    statistics?: {
      subscriberCount?: string
      videoCount?: string
    }
  }[]
  error?: YouTubeErrorBody['error']
}

interface YouTubeErrorBody {
  error?: {
    message?: string
    errors?: { reason?: string }[]
  }
}

/**
 * Searches YouTube channels and returns them normalised for the `influencers` table.
 * Calls `search.list` (type=channel), then `channels.list` for statistics.
 */
export async function searchYouTubeChannels(
  apiKey: string,
  query: string,
  options: SearchOptions = {},
): Promise<YouTubeChannel[]> {
  const maxResults = options.maxResults ?? 10

  const searchParams = new URLSearchParams({
    part: 'snippet',
    type: 'channel',
    q: query,
    maxResults: String(maxResults),
    key: apiKey,
  })

  if (options.regionCode) {
    searchParams.set('regionCode', options.regionCode.toUpperCase())
  }

  if (options.relevanceLanguage) {
    searchParams.set('relevanceLanguage', options.relevanceLanguage)
  }

  const searchData = await request<SearchListResponse>(`${YOUTUBE_API_BASE}/search?${searchParams}`)

  const channelIds = [
    ...new Set(
      (searchData.items ?? [])
        .map((item) => item.id?.channelId)
        .filter((id): id is string => Boolean(id)),
    ),
  ]

  if (channelIds.length === 0) {
    return []
  }

  const channelParams = new URLSearchParams({
    part: 'snippet,statistics',
    id: channelIds.join(','),
    key: apiKey,
  })

  const channelData = await request<ChannelListResponse>(
    `${YOUTUBE_API_BASE}/channels?${channelParams}`,
  )

  const byId = new Map(
    (channelData.items ?? [])
      .filter((item): item is typeof item & { id: string } => Boolean(item.id))
      .map((item) => [item.id, item]),
  )

  const channels: YouTubeChannel[] = []

  for (const channelId of channelIds) {
    const item = byId.get(channelId)

    if (!item) {
      continue
    }

    channels.push(mapChannel(channelId, item))
  }

  return channels
}

function mapChannel(channelId: string, item: NonNullable<ChannelListResponse['items']>[number]): YouTubeChannel {
  const snippet = item.snippet ?? {}
  const statistics = item.statistics ?? {}
  const thumbnails = snippet.thumbnails ?? {}

  const avatarUrl =
    thumbnails.high?.url ?? thumbnails.medium?.url ?? thumbnails.default?.url ?? null

  return {
    channelId,
    title: snippet.title?.trim() || channelId,
    handle: normaliseHandle(snippet.customUrl, channelId),
    description: snippet.description?.trim() || null,
    avatarUrl,
    profileUrl: `https://www.youtube.com/channel/${channelId}`,
    country: snippet.country?.toUpperCase() ?? null,
    followers: toCount(statistics.subscriberCount),
    totalPosts: toCount(statistics.videoCount),
    isVerified: 0,
  }
}

/** Turns a YouTube `customUrl` (`@handle`, `c/name`, legacy name) into a bare handle. */
export function normaliseHandle(customUrl: string | undefined, channelId: string): string {
  if (!customUrl) {
    return channelId
  }

  const last = customUrl.split('/').filter(Boolean).pop() ?? ''
  const handle = last.replace(/^@+/, '').trim()

  return handle || channelId
}

function toCount(value: string | undefined): number {
  const parsed = Number(value ?? 0)

  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0
}

async function request<T extends { error?: YouTubeErrorBody['error'] }>(url: string): Promise<T> {
  let response: Response

  try {
    response = await fetch(url)
  } catch (error) {
    throw new YouTubeError(
      `Could not reach the YouTube Data API: ${error instanceof Error ? error.message : String(error)}`,
      'YOUTUBE_UNREACHABLE',
    )
  }

  if (!response.ok) {
    const body = (await safeJson<YouTubeErrorBody>(response)) ?? {}
    const reason = body.error?.errors?.[0]?.reason
    const message = body.error?.message ?? `YouTube Data API returned HTTP ${response.status}.`

    throw new YouTubeError(
      reason ? `${message} (${reason})` : message,
      reason === 'quotaExceeded' ? 'YOUTUBE_QUOTA_EXCEEDED' : 'YOUTUBE_REQUEST_FAILED',
      502,
    )
  }

  return (await response.json()) as T
}

async function safeJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}
