---
name: api-envelopes
description: Use whenever adding/modifying a controller, response DTO, or list endpoint in this NestJS backend. Defines the project's success envelope, error envelope, and pagination conventions so new endpoints stay consistent with the global ResponseInterceptor and HttpExceptionFilter.
---

# API Envelopes & Pagination

The shape of every HTTP response in this codebase is decided by two global pieces — do **not** hand-craft envelopes in controllers. Just `return` the payload (or `throw` a NestJS exception) and let them format it.

- Success: [src/common/interceptors/response.interceptor.ts](../../../src/common/interceptors/response.interceptor.ts)
- Error: [src/common/filters/http-exception.filter.ts](../../../src/common/filters/http-exception.filter.ts)

---

## Success envelope

The interceptor wraps whatever the controller returns based on its runtime type:

| Controller returns         | Envelope                                    |
| -------------------------- | ------------------------------------------- |
| Any plain value `T`        | `{ code, data: T }`                         |
| `new ApiMessage('...')`    | `{ code, message }`                         |
| `new DataWithWarnings(d,w)`| `{ code, data: d, warnings: w }` (omitted when `w` is empty) |
| `undefined` + status `204` | empty body                                  |

`code` is the HTTP status (e.g. `200`, `201`).

Helpers:
- [ApiMessage](../../../src/common/api-message.ts) — for endpoints whose success response is a human-readable line ("A reset link has been sent.").
- [DataWithWarnings](../../../src/common/data-with-warnings.ts) — for non-fatal validation warnings hoisted next to `data` (e.g. id_number checksum).

**Do not** return raw `{ code, data }` objects from a controller — the interceptor will double-wrap them.

---

## Error envelope

`HttpExceptionFilter` catches every `HttpException` and unknown error:

```json
{ "code": 400, "message": "Email already in use" }
```

With multiple validation messages it adds `details`:

```json
{ "code": 400, "message": "name should not be empty", "details": ["name should not be empty", "email must be an email"] }
```

Rules:
- Throw NestJS exceptions (`BadRequestException`, `ConflictException`, `ForbiddenException`, `NotFoundException`, …). Never build error JSON yourself.
- For business-rule conflicts use `ConflictException('clear human message')` — see the guardian-deactivated 409 path for the convention.
- Unknown errors → `500 { code: 500, message: 'Internal server error' }` (logged server-side; no leak).

---

## Pagination

Pattern is consistent across `GET /students`, `GET /users`, etc.

**Query DTO** (mirror exactly — copy from [list-students.query.ts](../../../src/modules/students/dto/list-students.query.ts) or [list-users.query.ts](../../../src/modules/users/dto/list-users.query.ts)):

```ts
@ApiPropertyOptional({ minimum: 1, default: 1 })
@IsOptional() @Type(() => Number) @IsInt() @Min(1)
page?: number = 1;

@ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
@IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
limit?: number = 20;
```

Defaults: `page = 1`, `limit = 20`, hard cap `limit ≤ 100`.

**Service**:

```ts
const page = query.page ?? 1;
const limit = query.limit ?? 20;
qb.skip((page - 1) * limit).take(limit);
const [items, total] = await qb.getManyAndCount();
return { items, total, page, limit };
```

**Response DTO** — list payload always has these four fields, in this order:

```ts
class XListData {
  @ApiProperty({ type: [XResponse] }) items!: XResponse[];
  @ApiProperty({ example: 42 })       total!: number;
  @ApiProperty({ example: 1 })        page!: number;
  @ApiProperty({ example: 20 })       limit!: number;
}
```

The full response over the wire is therefore `{ code, data: { items, total, page, limit } }`. Don't invent `meta`, `pageCount`, `hasNext`, or cursor fields — none of the existing endpoints use them.

---

## Naming

Response DTO classes follow this suffix convention (used everywhere for OpenAPI generation):

- `XResponse` — single resource shape
- `XListData` — `{ items, total, page, limit }` payload
- `XEnvelope` / `XListEnvelope` — full `{ code, data }` wrapper, only declared when Swagger needs the wrapper documented (e.g. when including `warnings`)

Use `snake_case` for query params and response fields when the surrounding module already does (students, halaqat). Use `camelCase` where the module already does (users, auth). Match the file you're editing — don't mix.
