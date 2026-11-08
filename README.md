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

Each search costs one request from your quota; new accounts start with 100
free requests. When the key is missing the endpoint answers `503`; when YouTube
rejects the call it answers `502`; when the quota is empty it answers `402`.
Both influencer endpoints require a signed-in session (see
[Accounts, quota, and payments](#accounts-quota-and-payments)).

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
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Which Brazilian fitness creators have more than 100k followers?"}'
```

`cookies.txt` is the cookie jar saved from `POST /login`; the endpoint answers
`401` without a session.

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

## Accounts, quota, and payments

The app has a small SaaS layer on top of the influencer API:

- `GET /register` and `POST /register` — create an account. New accounts get
  **100 free requests**. There is no email verification.
- `GET /login` and `POST /login` — sign in with email and password. The session
  lives in an HttpOnly cookie (`cabe_session`) for 30 days.
- `POST /logout` — delete the session.
- `GET /dashboard` — remaining quota, recent API calls, and the top-up button.
- `GET /api/me` — JSON endpoint with the signed-in user and remaining quota.

`GET /influencers/search` and `POST /influencers/query` require a signed-in
user. Each call reserves one request from `users.quota_remaining`, writes a row
to `api_requests`, and refunds the request when the endpoint answers with a 4xx
or 5xx status. When the quota is empty the endpoint answers `402`.

### Buying quota with DOKU

The only plan is **1,000 requests for Rp50.000**. `POST /billing/checkout`
creates a `PENDING` order, asks DOKU Checkout for a payment URL, and redirects
the browser there.

Set these values locally in `.dev.vars`:

```txt
DOKU_CLIENT_ID=BRN-...
DOKU_API_KEY=SK-...
DOKU_IS_PRODUCTION=false
```

`DOKU_API_KEY` is the DOKU **Secret Key**. In production set both values as
secrets and switch the API host with `DOKU_IS_PRODUCTION=true`:

```sh
npx wrangler secret put DOKU_CLIENT_ID
npx wrangler secret put DOKU_API_KEY
npx wrangler secret put DOKU_IS_PRODUCTION
```

DOKU sends the payment result to the webhook below. The endpoint verifies the
`Signature` header with the same HMAC-SHA256 scheme used to create the payment,
checks the invoice and amount, then adds the 1,000 credits in one D1 batch. A
`credited_at` guard makes duplicate notifications safe.

```txt
POST <BASE_URL>/billing/doku/notification
```

The checkout request also sends this URL as
`additional_info.override_notification_url`, so the webhook works without extra
dashboard configuration. `BASE_URL` must be a public URL for DOKU to reach it;
`http://localhost:5173` only works for local UI testing.

`GET /payment/success` and `GET /payment/failed` are the pages DOKU redirects to
after checkout. They do **not** grant quota by themselves — only the webhook
does.

### Quota tables

`migrations/0002_users.sql` creates:

| Table         | Purpose                                                        |
| ------------- | -------------------------------------------------------------- |
| `users`       | Email, PBKDF2 password hash, and `quota_remaining`             |
| `sessions`    | SHA-256 hash of the session token and its expiry               |
| `api_requests`| One row per influencer API call, with before/after quota values |
| `orders`      | DOKU invoice, amount, quota amount, status, and payment URL     |

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
