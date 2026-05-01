# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Halaqa backend — a NestJS 11 + TypeScript service. As of this writing it is the unmodified `nest new` scaffold (single `AppModule` with `AppController` returning "Hello World" from `AppService`). Real domain code has not been added yet, so when starting a feature, expect to introduce the first non-trivial module structure rather than fit into existing patterns.

## Package manager

Uses **pnpm** (see [pnpm-lock.yaml](pnpm-lock.yaml)). Do not run `npm install` or `yarn` — it will create a competing lockfile.

## Common commands

Run from [halaqa-backend/](.):

```bash
pnpm install              # install deps
pnpm run start:dev        # dev server with watch (port 3000, override via PORT env var)
pnpm run start:debug      # dev server with --debug
pnpm run start:prod       # run compiled output in dist/
pnpm run build            # nest build → dist/

pnpm run lint             # eslint --fix on src/, apps/, libs/, test/
pnpm run format           # prettier --write src/ test/

pnpm run test             # jest unit tests (*.spec.ts under src/)
pnpm run test:watch
pnpm run test:cov         # coverage → ../coverage/
pnpm run test:e2e         # jest with test/jest-e2e.json (*.e2e-spec.ts under test/)
```

Run a single unit test file or filter by name:

```bash
pnpm exec jest src/app.controller.spec.ts
pnpm exec jest -t "should return"
```

## OpenAPI spec

The committed spec at [docs/openapi.json](docs/openapi.json) is generated, not hand-edited.

```bash
pnpm run docs:export      # regenerate docs/openapi.json
pnpm run docs:check       # exit non-zero if committed spec is stale
```

`docs:check` boots `AppModule` (so it needs a live DB and valid env), rebuilds the spec in-memory, and string-compares to the committed file. Use it in CI or pre-commit to prevent drift.

## Database migrations

Schema lives in TypeORM entity decorators. Dev still runs with `DB_SYNCHRONIZE=true` for fast iteration, but the canonical schema is captured in [migrations/](migrations/) and is what production should apply. The CLI uses the standalone DataSource at [src/config/data-source.ts](src/config/data-source.ts), separate from the Nest-managed runtime config in [src/config/typeorm.config.ts](src/config/typeorm.config.ts).

```bash
pnpm migration:run                            # apply pending migrations
pnpm migration:show                           # which are applied / pending
pnpm migration:revert                         # roll back the most recent
pnpm migration:generate migrations/<Name>     # diff entities vs DB → new migration
```

`migration:generate` diffs entities against the **currently connected** database. With `DB_SYNCHRONIZE=true` your dev DB matches the entities exactly, so the diff is empty. To regenerate against a clean schema, first spin up an empty temporary DB (`halaqa_migrations`):

```bash
pnpm exec ts-node scripts/with-empty-db.ts create
$env:DB_NAME = 'halaqa_migrations'              # PowerShell — bash: DB_NAME=halaqa_migrations
pnpm migration:generate migrations/<Name>
pnpm exec ts-node scripts/with-empty-db.ts drop
```

For production: set `DB_SYNCHRONIZE=false` and run `pnpm migration:run` against the prod DB before/at deploy time.

## Architecture notes

- **Entrypoint**: [src/main.ts](src/main.ts) bootstraps `AppModule`. `app.listen(process.env.PORT ?? 3000)` — no global pipes, filters, CORS, or prefix configured yet; add them here when needed.
- **Jest config lives in `package.json`** (`jest.rootDir = "src"`), so unit tests must sit alongside source files as `*.spec.ts`. End-to-end tests use a separate config at [test/jest-e2e.json](test/jest-e2e.json).
- **Build config**: [nest-cli.json](nest-cli.json) sets `deleteOutDir: true`, so `pnpm run build` wipes `dist/` each time — don't drop hand-written files there.
- ESLint flat config is in [eslint.config.mjs](eslint.config.mjs); Prettier rules in [.prettierrc](.prettierrc).
