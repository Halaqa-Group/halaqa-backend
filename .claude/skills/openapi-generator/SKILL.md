# 🚀 OpenAPI Generator

Generate **OpenAPI 3.0 / 3.1 specifications** automatically from your API codebase.

Supports:

* Express
* Next.js
* Fastify
* Hono
* NestJS

Exports ready-to-use specs for:

* Postman
* Insomnia
* Swagger UI

---

## 🧠 Core Workflow

1. **Scan routes** → detect all API endpoints
2. **Extract schemas** → types, params, request/response
3. **Build paths** → convert routes to OpenAPI format
4. **Generate schemas** → reusable components
5. **Add documentation** → descriptions, tags, examples
6. **Export spec** → YAML / JSON

---

## 📄 OpenAPI 3.1 Base Template

```yaml
openapi: 3.1.0

info:
  title: API Title
  version: 1.0.0
  description: API description
  contact:
    email: api@example.com
  license:
    name: MIT
    url: https://opensource.org/licenses/MIT

servers:
  - url: http://localhost:3000/api
    description: Development
  - url: https://api.example.com
    description: Production

tags:
  - name: Users
    description: User management endpoints
  - name: Products
    description: Product catalog endpoints

paths: {}

components:
  schemas: {}
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
    apiKey:
      type: apiKey
      in: header
      name: X-API-Key

security:
  - bearerAuth: []
```

---

## 🔧 TypeScript → OpenAPI Schema Converter

```ts
function typeToOpenAPISchema(checker: ts.TypeChecker, type: ts.Type): OpenAPISchema
```

### Handles:

* ✅ Primitives (`string`, `number`, `boolean`)
* ✅ Arrays
* ✅ Objects (with required fields)
* ✅ Enums (union literals)

---

## 🔍 Express Route Scanner (JSDoc-based)

```ts
interface RouteMetadata {
  method: string;
  path: string;
  summary?: string;
  description?: string;
  tags?: string[];
}
```

### Supported JSDoc tags:

```js
/**
 * @summary Get user
 * @description Returns user by ID
 * @tags Users
 */
```

---

## ⚙️ OpenAPI Spec Generator

```ts
function generateOpenAPISpec(routes, options): OpenAPISpec
```

### Features:

* Converts `:id` → `{id}`
* Auto-generates:

  * parameters
  * responses
  * tags
* Adds default security

---

## 📦 Default Responses

| Code | Description      |
| ---- | ---------------- |
| 200  | Success          |
| 201  | Created (POST)   |
| 204  | Deleted (DELETE) |
| 400  | Bad request      |
| 401  | Unauthorized     |
| 404  | Not found        |
| 500  | Server error     |

---

## 🧩 Common Schemas

### Error

```yaml
Error:
  type: object
  required: [code, message]
  properties:
    code:
      type: string
    message:
      type: string
    details:
      type: object
```

### Pagination

```yaml
Pagination:
  type: object
  properties:
    page:
      type: integer
    limit:
      type: integer
    total:
      type: integer
```

### User

```yaml
User:
  type: object
  required: [id, email, name]
  properties:
    id:
      type: string
      format: uuid
    email:
      type: string
      format: email
    name:
      type: string
```

---

## ⚡ Fastify Integration

```ts
fastify.register(swagger)
fastify.register(swaggerUi, { routePrefix: "/docs" })
```

Access docs at:

```
/docs
```

---

## 🧱 NestJS Integration

```ts
@ApiTags("users")
@Controller("users")
export class UsersController {}
```

### Decorators:

* `@ApiOperation`
* `@ApiResponse`
* `@ApiBody`

---

## 🖥 CLI Usage

```bash
openapi-gen \
  --framework express \
  --source ./src \
  --output openapi.yaml \
  --title "My API"
```

### Options

| Flag          | Description                |
| ------------- | -------------------------- |
| `--framework` | express / fastify / nextjs |
| `--source`    | source folder              |
| `--output`    | output file                |
| `--json`      | export JSON                |

---

## ✅ Validation

```ts
SwaggerParser.validate("openapi.yaml")
```

✔ Ensures spec is valid before publishing

---

## 🧠 Best Practices

* Use `$ref` for reusable schemas
* Add **real examples**
* Document **all error cases**
* Group endpoints with **tags**
* Keep spec in **version control**
* Validate before deployment
* Generate SDKs when needed

---

## 📋 Output Checklist

* [ ] All routes included
* [ ] Path params use `{param}`
* [ ] Request/response schemas defined
* [ ] Shared schemas extracted
* [ ] Security configured
* [ ] Tags applied
* [ ] Examples added
* [ ] Spec validated
* [ ] Export successful