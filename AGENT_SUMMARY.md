# Repository Summary — jwt-pizza-service

Purpose

- Backend service for a "JWT Pizza" system: manages users, franchises, stores, menu items, and diner orders; forwards orders to an external "factory" service. JWTs are used for authentication.

Top-level files

- package.json: start/test/lint scripts and dependencies (express, jsonwebtoken, mysql2, bcrypt, jest, supertest).
- README.md: usage and config example.
- src/: main source code.
- test/: test files.

Key source files and responsibilities

- src/index.js
  - Entrypoint that loads src/service.js and starts the HTTP server (port from argv or 3000).

- src/service.js
  - Express app setup, JSON body parsing, CORS headers, global auth middleware (setAuthUser), mounts API routers under /api, exposes /api/docs and root endpoint, 404 handler and error handler.

- src/routes/*
  - authRouter.js: register/login/logout flow, JWT creation/verification, setAuthUser middleware exported for global use; uses DB to validate tokens, DB.loginUser/logoutUser; provides docs array describing endpoints.
  - userRouter.js: get authenticated user (/me), update user, placeholders for delete/list; uses setAuth to re-issue token on update.
  - orderRouter.js: menu CRUD (admin-protected), list user orders, create order which writes to DB and posts to factory API; uses config.factory and fetch.
  - franchiseRouter.js: list franchises, user franchises, create/delete franchise, create/delete store; has RBAC checks using user roles.

- src/database/database.js (DB)
  - Central DB wrapper using mysql2/promise. Important methods: getMenu, addMenuItem, addUser, getUser, updateUser, loginUser, isLoggedIn, logoutUser, getOrders, addDinerOrder, createFranchise, deleteFranchise, getFranchises, getUserFranchises, getFranchise, createStore, deleteStore.
  - Initializes DB and runs table creation statements (src/database/dbModel.js). Inserts default admin if DB newly created.
  - Notes: uses plain SQL built via template strings in a few places (be cautious of injection in untrusted inputs), many methods open a connection and call connection.end() in finally.

- src/database/dbModel.js
  - SQL DDL statements for tables: auth, user, menu, franchise, store, userRole, dinerOrder, orderItem.

- src/model/model.js
  - Role constants: { diner, franchisee, admin } used for RBAC checks.

- src/endpointHelper.js
  - asyncHandler to wrap async route handlers and StatusCodeError helper.

- src/config.js
  - Runtime configuration (jwtSecret, DB connection details, factory url/apiKey, listPerPage). NOTE: this repo currently contains concrete credentials/secrets — rotate and move to environment variables for production and CI.

- test/utils.js
  - Helper: createAdminUser and randomName that uses DB.addUser directly (integration-style tests against real DB).

Notable implementation details and potential issues to flag

- SQL usage: occasional string interpolation for identifiers/limits and getID uses table name interpolation; ensure values are sanitized and avoid concatenating untrusted inputs into SQL.
- getOffset bug: DB.getOffset returns `(currentPage - 1) * [listPerPage]` (square brackets create an array) — this will compute incorrectly and likely cause NaN or unexpected results; should be `(currentPage - 1) * listPerPage`.
- getTokenSignature: extracts JWT signature by splitting on '.' and uses parts[2]; this assumes tokens are well-formed; DB.loginUser stores signatures in auth table which is okay but be consistent across clients.
- updateUser returns this.getUser(email, password) but if email or password omitted this could behave unexpectedly (getUser expects an email param); tests should cover update flows.
- Tests: test coverage should be at least 80%.

How to run locally

- Requires a MySQL server reachable with credentials in src/config.js (or override with your own config file).
- npm install (dependencies are already listed). Start: npm start (runs node src/index.js). Tests: npm test (runs jest).

Recommended tasks for future coding agents (prioritized)

1. Add unit and integration tests:
   - Unit tests for endpointHelper, model constants.
   - Router tests using supertest + mocked DB. Implement a DB mock wrapper and inject it to the app to allow fast unit tests for routes.
   - Integration tests that spin up a test MySQL (or use sqlite/mysql in-memory) and validate DB methods and full routes.
2. Fix bugs and hardening:
   - Fix DB.getOffset bug.
   - Sanitize or parameterize any interpolated SQL identifiers and limits.
3. Increase coverage by testing edge cases: login failures, invalid tokens, RBAC enforcement, pagination, transaction rollbacks.
4. Mock external factory API in tests using nock or fetch mock.

Agent guidance for editing

- Make minimal, surgical changes per PR.
- When writing tests, prefer dependency injection: export a function that builds app with an injectable DB stub/mocks (currently DB is imported as a singleton which makes mocking harder; consider refactor to allow injecting DB instance into routers or service for testing).
- Avoid creating network DB side effects at module import time; delay DB initialization or make it explicit. The current DB constructor calls initializeDatabase immediately which may make tests slower or flaky.

Useful entry points for agents

- src/service.js — to mount routers and run app in tests via supertest.
- src/routes/*.js — routers implement endpoints and contain docs arrays useful for generating test cases.
- src/database/database.js — core logic for persistent operations and a place to add mocks or refactor.

Summary

- Small Express app with clear responsibilities, DB-backed features, and JWT auth.
