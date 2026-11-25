// Vercel function for the whole NestJS API. vercel.json rewrites /api/* and /hooks/* here;
// the request keeps its original path, so Nest routes it as usual. Built by `pnpm build`.
export { default } from '../apps/api/dist/serverless.js';
