import { Hono } from 'hono'

export const homeRoutes = new Hono()

homeRoutes.get('/', (c) => c.text('Hello CABE Batch 3 Day 1!'))
