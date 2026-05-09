# Claude Code Project Management Skill
Version: 1.0

Purpose:
This skill defines how the coding agent must plan, implement, validate, and present software changes for backend systems built primarily with NestJS + TypeORM.

The goal is:
- Small reviewable feature increments
- Clear implementation planning
- Safe database evolution
- High maintainability
- Predictable commits
- Human-controlled execution

---

# Core Execution Rules

## Mandatory Workflow

The agent MUST:

1. Analyze the request
2. Break work into feature-level actionable tasks
3. Present implementation plan before coding
4. Wait for approval
5. Execute ONE feature task only
6. Stop after task completion
7. Provide:
   - summary
   - changed files
   - manual test guide
   - unit test summary
   - commit message
   - branch suggestion
   - PR draft
8. Wait for next approval

The agent MUST NOT continue automatically to the next feature task.

---

# Planning Protocol

Before implementation, the agent MUST provide:

## 1. Feature Breakdown
List implementation tasks in dependency order.

Example:
1. Database schema
2. DTOs
3. Service logic
4. Controller endpoints
5. Unit tests
6. Documentation

Tasks should be:
- medium granularity
- independently reviewable
- feature-oriented
- low-overhead

Avoid:
- giant tasks
- micro-tasks with no value

---

## 2. Dependency Summary

Identify:
- prerequisite tasks
- shared modules impacted
- possible integration risks

Keep concise.

---

## 3. API Impact Summary

State:
- new endpoints
- changed endpoints
- removed endpoints
- request/response changes
- auth/permission changes
- pagination/filtering changes

If no API impact:
- explicitly state it

---

## 4. Database Impact Summary

State:
- schema changes
- migrations needed
- indexes added
- nullable/non-nullable changes
- data migration risks
- rollback concerns

The agent MUST ask before generating migrations.

---

## 5. Breaking Change Warning

Explicitly identify:
- breaking API changes
- renamed fields
- deleted behavior
- contract changes
- migration risks

If none:
- explicitly state "No breaking changes identified."

---

## 6. Risk Level

Each feature task should include:
- LOW
- MEDIUM
- HIGH

Criteria:
- DB changes
- auth/security changes
- shared module modifications
- external integrations

---

# Architecture Rules

## General Principles

The agent MUST follow:
- SOLID principles
- separation of concerns
- modular design
- explicit contracts
- clean dependency flow

---

## NestJS Rules

Mandatory:
- DTOs for request validation
- OpenAPI decorators
- serialization consistency
- service/controller separation
- repository abstraction
- dependency injection best practices

Avoid:
- business logic in controllers
- fat services
- circular dependencies
- hidden shared state

---

## TypeORM Rules

Mandatory:
- explicit relations
- safe migrations
- indexed foreign keys when appropriate
- transactional consistency for critical operations

Avoid:
- unsafe eager loading
- N+1 query patterns
- hidden cascade side effects

---

# Refactoring Rules

Allowed:
- gradual improvement in touched areas
- local cleanup
- extraction of reusable utilities
- readability improvements

Not allowed:
- massive rewrites
- architecture replacement without approval
- unrelated refactors
- global formatting changes

Refactors should remain isolated and reviewable.

---

# Dependency Rules

The agent MUST:
- ask before installing packages
- explain why dependency is needed
- prefer existing dependencies
- avoid unnecessary libraries

The agent MUST NOT:
- silently install dependencies
- replace existing libraries without approval

---

# Database & Migration Rules

Before migration generation, the agent MUST:
- explain schema impact
- explain rollback implications
- identify data safety concerns

Migration generation requires approval.

Avoid:
- destructive schema changes
- implicit data deletion
- unsafe column type changes

---

# Testing Rules

A task is NOT complete unless:
- unit tests pass
- edge cases are covered
- docs are updated
- manual test steps are provided

Minimum expectations:
- happy path coverage
- validation failures
- edge cases
- permission checks where applicable

Prefer:
- service-level tests
- controller tests for API behavior

---

# Documentation Rules

The agent MUST update when relevant:
- README
- API docs
- changelog
- usage examples

Documentation updates should remain concise.

---

# Communication Style

Preferred style:
- concise
- operational
- semi-explanatory
- structured markdown

Avoid:
- excessive narrative
- long theoretical explanations
- unnecessary repetition

---

# Mandatory Task Output Format

After planning, each task MUST use the following structure:

---

# Task: <task name>

## Objective
Short description.

## Scope
What is included.

## Out of Scope
What is intentionally excluded.

## Files Expected to Change
- path/example.ts
- src/module/...

## API Impact
Describe API changes or state "None".

## DB Impact
Describe DB changes or state "None".

## Risk Level
LOW / MEDIUM / HIGH

## Implementation Checklist
- [ ]
- [ ]
- [ ]

## Unit Tests
- [ ]
- [ ]

## Manual Test Guide
1.
2.
3.

## Breaking Changes
State explicitly.

## Suggested Branch Name
feat/example-feature

## Suggested Commit Message
feat(scope): concise description

---

# Completion Output Format

After implementation, the agent MUST provide:

## Completed
Summary of work completed.

## Files Changed
List changed files.

## Important Notes
Risks, caveats, follow-ups.

## Manual Validation Steps
Step-by-step validation.

## Tests Executed
List executed tests.

## Docs Updated
List updated docs/changelog entries.

## Suggested Commit Message
feat(scope): concise description

## Suggested PR Title
Short PR title.

## Suggested PR Description
Concise PR summary including:
- feature summary
- API impact
- DB impact
- testing summary
- migration notes
- breaking changes

Then STOP and wait for approval.

---

# Branch Naming Convention

Preferred patterns:
- feat/feature-name
- fix/bug-name
- refactor/module-name

Use concise kebab-case naming.

---

# Commit Rules

Commits MUST:
- be feature-scoped
- remain reviewable
- avoid unrelated changes

Format:
type(scope): description

Examples:
- feat(auth): add refresh token rotation
- fix(student): prevent duplicate attendance records
- refactor(reporting): extract attendance query builder

---

# Backward Compatibility Rules

Default behavior:
- preserve backward compatibility
- avoid breaking contracts
- deprecate before removal

For risky changes:
- recommend feature flags
- recommend phased rollout

---

# Anti-Patterns

The agent MUST NOT:
- introduce hidden breaking changes
- silently modify contracts
- install dependencies without approval
- edit generated files manually
- perform global formatting changes
- refactor unrelated modules
- create giant commits
- mix refactor + feature + migration in one task unnecessarily

---

# Handling Uncertainty

If requirements are unclear, the agent MUST:
1. pause implementation
2. ask concise clarification questions
3. provide recommended options
4. explain tradeoffs briefly

Avoid assumptions for:
- auth behavior
- permissions
- database contracts
- external integrations

---

# Definition of Done

A task is complete only when:
- implementation is finished
- unit tests pass
- docs/changelog updated
- manual validation steps provided
- no unresolved blockers remain
- implementation matches approved scope

---

# Recommended Execution Philosophy

Preferred:
- incremental delivery
- small reviewable diffs
- explicit contracts
- predictable architecture
- stable APIs
- low-risk iteration

Over:
- large autonomous rewrites
- hidden architectural drift
- overengineering
- unnecessary abstractions

---