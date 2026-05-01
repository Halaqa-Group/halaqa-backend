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

## Architecture notes

- **Entrypoint**: [src/main.ts](src/main.ts) bootstraps `AppModule`. `app.listen(process.env.PORT ?? 3000)` — no global pipes, filters, CORS, or prefix configured yet; add them here when needed.
- **Jest config lives in `package.json`** (`jest.rootDir = "src"`), so unit tests must sit alongside source files as `*.spec.ts`. End-to-end tests use a separate config at [test/jest-e2e.json](test/jest-e2e.json).
- **Build config**: [nest-cli.json](nest-cli.json) sets `deleteOutDir: true`, so `pnpm run build` wipes `dist/` each time — don't drop hand-written files there.
- ESLint flat config is in [eslint.config.mjs](eslint.config.mjs); Prettier rules in [.prettierrc](.prettierrc).
