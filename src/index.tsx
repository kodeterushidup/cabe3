import { Hono } from 'hono'

const app = new Hono()
app.get('/', (c) => c.text('Hello CABE Batch 3 Day 1!'))

export default app
