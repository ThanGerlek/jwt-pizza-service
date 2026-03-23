# Logging Conventions

This document defines the structured log contract for `jwt-pizza-service` so logs are queryable and safe by default.

## Event Types

- `http`: emitted by HTTP middleware for inbound request/response pairs.
- `db-query`: emitted for each SQL query execution at the DB chokepoint.
- `factory-request`: emitted before calling the external factory API.
- `factory-response`: emitted after factory response or when a factory call fails.
- `auth-unauthorized`: emitted when a protected route is hit without a valid authenticated user (handled in auth middleware).
- `request-error`: emitted when an error is passed to Express’s error-handling middleware (handled route errors).
- `unhandled-exception`: reserved for **process-level** failures only (`uncaughtException`, `unhandledRejection` in `index.js`).

## Common Fields

Use these keys when they apply to an event:

- `path`: inbound request path (example: `/api/order`)
- `method`: inbound HTTP method (`GET`, `POST`, etc.)
- `statusCode`: HTTP status code for response/error events
- `durationMs`: elapsed duration in milliseconds for calls/queries
- `error`: object containing `{ name, message }` and optionally `stack` (stack is omitted for client-side `request-error` logs; stack is sanitized when present)

## Event Schemas

### `db-query`

- `sql`: query text
- `params`: SQL parameters (sanitized)
- `resultType`: `rows` or `result`
- `rowCount`: row count when `resultType` is `rows`
- `durationMs`
- `error` (error path only)

### `factory-request`

- `path`, `method`
- `factoryUrl`
- `factoryMethod`
- `factoryHeaders` (sanitized)
- `factoryRequestBody` (sanitized)

### `factory-response`

- `path`, `method`
- `factoryUrl`
- `statusCode` (when available)
- `ok`
- `durationMs`
- `factoryResponseBody` (sanitized, success/failure response payload)
- `error` (network/parse failure path)

### `auth-unauthorized`

- `path`, `method`, `statusCode` (typically `401`)
- `message` (short reason, e.g. `unauthorized`)

### `request-error`

Errors that reached the default Express error handler (after `next(err)`).

- `path`, `method`, `statusCode`
- `error`: `{ name, message }` for **4xx** responses (no `stack`)
- `error`: `{ name, message, stack }` for **5xx** responses

Log **level**: `warn` for 4xx, `error` for 5xx (aligned with HTTP access-log severity).

### `unhandled-exception`

**Process** lifecycle only (not per-request):

- `type`: `unhandledRejection` or `uncaughtException`
- `reason` (for rejections) or `error` (for exceptions)

## Sanitization Policy

All logs pass through a centralized sanitizer before emission. The sanitizer:

- Redacts sensitive key values in nested payloads.
- Applies to bodies, headers, params, and error metadata.
- Preserves authorization scheme while hiding credentials (example: `Bearer *****`).
- Uses safe serialization with circular reference handling and size truncation.

Sensitive keys (case-insensitive):

- `password`
- `authorization`
- `apiKey` / `api_key`
- `token`
- `jwt`
- `cookie`
- `secret`
- `session`

## Practical Querying Tips

- Filter by `type` first, then by `path`/`statusCode` for HTTP and exception triage.
- Use `durationMs` percentiles for latency dashboards on DB and factory events.
- Correlate `factory-request` and `factory-response` by close timestamps and matching `path`/`factoryUrl`.
- Use `request-error` for application errors handled by Express; use `unhandled-exception` for process-level crashes only.
