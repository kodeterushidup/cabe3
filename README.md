```txt
npm install
npm run dev
```

```txt
npm run deploy
```

## PDF ingestion

The `POST /ingest` endpoint turns a PDF into vectors:

1. `env.AI.toMarkdown()` converts the PDF to Markdown.
2. The text is split into overlapping chunks.
3. `@cf/baai/bge-m3` creates one 1024-dimension embedding per chunk.
4. The vectors are written to the `VECTORIZE` binding (index `cabe3-documents`).

Create the Vectorize index once per Cloudflare account:

```txt
npm run vectorize:create
```

Send a PDF as `multipart/form-data`:

```sh
curl -X POST http://localhost:5173/ingest \
  -F "file=@./document.pdf"
```

Or send the raw file body:

```sh
curl -X POST "http://localhost:5173/ingest?filename=document.pdf" \
  -H "Content-Type: application/pdf" \
  --data-binary @./document.pdf
```

The response lists the `documentId`, the chunk count, and the Vectorize ids that
were written. Re-uploading the same file overwrites the same vectors because the
ids come from a SHA-256 hash of the file content. The index binding has
`"remote": true` because Vectorize has no local emulation, so `npm run dev`
needs a Cloudflare login with access to the index.

## Semantic PDF search

`POST /query` searches the chunks written by `/ingest`. It embeds the query with
the same model (`@cf/baai/bge-m3`) and asks the Vectorize index for the closest
chunks.

```sh
curl -X POST http://localhost:5173/query \
  -H "Content-Type: application/json" \
  -d '{"query":"How does the described system handle failures?","topK":5}'
```

| Field      | Required | Default | Description                                      |
| ---------- | -------- | ------- | ------------------------------------------------ |
| `query`    | yes      | -       | Text to search for (1-2000 characters)           |
| `topK`     | no       | `5`     | How many chunks to return (1-20)                 |
| `minScore` | no       | -       | Drop matches below this cosine similarity        |

```json
{
  "query": "How does the described system handle failures?",
  "topK": 5,
  "embeddingModel": "@cf/baai/bge-m3",
  "count": 2,
  "results": [
    {
      "id": "f3a1c9b0d2e4a6b8c0d2e4a6b8c0d2e4-0007",
      "score": 0.83,
      "documentId": "f3a1c9b0d2e4a6b8c0d2e4a6b8c0d2e4",
      "source": "design.pdf",
      "chunkIndex": 7,
      "text": "When the primary node fails, the replica takes over..."
    }
  ]
}
```

Results include the chunk text and its source metadata, so you can show the
passages and highlight the document they came from.

## YouTube channel search

`GET /influencers/search` searches YouTube channels and stores them in the
`influencers` table:

1. `search.list` (`type=channel`) finds channels matching `q`.
2. `channels.list` adds subscriber and video counts.
3. Every channel is upserted into `influencers` keyed by `(platform, handle)`,
   so running the same search again refreshes rows instead of duplicating them.

The response returns the stored rows, highest follower count first.

| Query param         | Required | Default | Description                                  |
| ------------------- | -------- | ------- | -------------------------------------------- |
| `q`                 | yes      | -       | Creator name, niche, or keyword (max 200)    |
| `maxResults`        | no       | `10`    | Channels to fetch (1-50)                     |
| `regionCode`        | no       | -       | ISO country code to bias the search, e.g. `BR`|
| `relevanceLanguage` | no       | -       | Language code to bias the search, e.g. `en`  |

```sh
curl "http://localhost:5173/influencers/search?q=fitness&maxResults=5&regionCode=BR"
```

```json
{
  "query": "fitness",
  "count": 1,
  "influencers": [
    {
      "id": 1,
      "name": "Example Fitness",
      "bio": "Workouts every week.",
      "platform": "youtube",
      "handle": "examplefitness",
      "profileUrl": "https://www.youtube.com/channel/UC...",
      "avatarUrl": "https://yt3.ggpht.com/...",
      "country": "BR",
      "followers": 125000,
      "totalPosts": 340,
      "isVerified": 0,
      "createdAt": "2026-11-08T10:00:00.000Z",
      "updatedAt": "2026-11-08T10:00:00.000Z"
    }
  ]
}
```

The endpoint needs a YouTube Data API v3 key. Locally it comes from
`YOUTUBE_API_KEY` in `.dev.vars`; in production set it as a secret:

```sh
npx wrangler secret put YOUTUBE_API_KEY
```

Each search costs 100 quota units, so the free daily quota allows 100 searches.
When the key is missing the endpoint answers `503`; when YouTube rejects the
call or the quota is exhausted it answers `502`.

## Natural-language influencer query

`POST /influencers/query` asks `liquid/lfm-3-1.7b:free` (OpenRouter) a
question about the `influencers` table. The model gets two Vercel AI SDK tools:

- `searchInfluencers` — filtered, parameterised D1 query (text, platform,
  country, region, niche, follower range, verification, sorting, pagination).
- `getInfluencer` — fetch one row by `id`.

The endpoint returns the model answer and every tool call with its result, so
you can see which query produced the answer. The agent loop stops after 5 steps.

```sh
curl -X POST http://localhost:5173/influencers/query \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Which Brazilian fitness creators have more than 100k followers?"}'
```

```json
{
  "answer": "Two Brazilian fitness creators have more than 100k followers: ...",
  "toolCalls": [
    {
      "tool": "searchInfluencers",
      "input": { "country": "BR", "niche": "fitness", "minFollowers": 100000 },
      "output": { "count": 2, "influencers": [] }
    }
  ]
}
```

The provider key comes from `PROVIDER_API_KEY` in `.dev.vars`.

## Database

Influencers live in Cloudflare D1, bound as `DB` (see `wrangler.jsonc`). Create
or update the schema with:

```sh
npx wrangler d1 migrations apply cabe3 --local
npx wrangler d1 migrations apply cabe3 --remote
```

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
npm run cf-typegen
```

Bindings are typed by the `Env` interface in `src/lib/env.ts` (including `DB` for
D1 and `YOUTUBE_API_KEY`). Import it when you need access to `c.env`:

```ts
// src/index.tsx
import type { Env } from './lib/env'

const app = new Hono<{ Bindings: Env }>()
```
