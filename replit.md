# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### Incident Intelligence Studio (`artifacts/incident-intelligence`)
- **Preview path**: `/`
- **Type**: React + Vite
- **Purpose**: Enterprise observability assistant for analyzing incidents, reviewing API contracts, and reviewing system designs.

### API Server (`artifacts/api-server`)
- **Preview path**: `/api`
- **Type**: Express 5 API

## Key Features
- Incident Analyzer with 4 demo correlation IDs (CORR-500-TIMEOUT, CORR-AUTH-401, CORR-DOWNSTREAM-FAIL, CORR-VALIDATION-ERROR)
- POST /api/analyze-incident — deterministic mock analysis with keyword detection for raw logs
- GET /api/incidents — list recent incident analyses (stored in PostgreSQL)
- GET /api/dashboard/stats — dashboard aggregates
- POST /api/review-contract — API contract review with schema analysis
- POST /api/review-design — system design review with pattern matching

## DB Schema

### incidents
- id, correlationId, serviceName, environment, logSource
- analyzedAt, summary, probableRootCause
- timeline, affectedServices, errorPatterns, downstreamFailures (JSONB)
- suggestedFixes (JSONB), suggestedRollback, confidence, mttr

## Important Notes
- After running codegen, manually fix `lib/api-zod/src/index.ts` to only export from `./generated/api` (not `./generated/types`) to avoid duplicate export conflicts.
- Dashboard stats floor at baseline mock values so the dashboard always shows meaningful metrics even when the DB is empty.
