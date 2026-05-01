---
name: nest-test
description: Generate unit tests for NestJS services and controllers with Jest. Use when writing backend tests.
---

# Generate NestJS Unit Tests

Create comprehensive unit tests for NestJS services and controllers using Jest.

> **Important:** Follow the Learning Mode guidelines in `_templates/learning-mode.md`

## Arguments
- `$ARGUMENTS` - File path to service/controller (e.g., "users.service.ts")

## Instructions

When the user runs `/nest-test <file>`:

### Step 1: Analyze the file
Read the target file and identify:
- Class name and type (Service/Controller)
- Dependencies (injected services)
- Methods to test
- External calls (Prisma, other services)

### Step 2: Show test plan
```
📋 Test Plan for: UsersService

Methods to test:
1. findAll() - List users
2. findOne(id) - Get single user
3. create(dto) - Create user
4. update(id, dto) - Update user
5. remove(id) - Delete user

Mocks needed:
- PrismaService
- EmailService (if used)

Test file: users.service.spec.ts
```

Ask: "Bạn có muốn thêm/bớt test cases nào không?"

### Step 3: Create test file
Location: Same folder as source file
Naming: `<filename>.spec.ts`

### Step 4: Write tests step by step

For EACH method, write:
1. **Happy path** - Normal successful case
2. **Edge cases** - Empty data, null values
3. **Error cases** - Not found, validation errors

#### Test structure:
```typescript
describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;

  beforeEach(async () => {
    // Setup TestingModule with mocks
  });

  describe('findOne', () => {
    it('should return a user when found', async () => {
      // Arrange
      // Act
      // Assert
    });

    it('should throw NotFoundException when user not found', async () => {
      // Test error case
    });
  });
});
```

### Step 5: Explain after each test
1. Explain the AAA pattern (Arrange-Act-Assert)
2. Explain WHY we mock dependencies
3. Explain the assertion used
4. Ask: "Bạn hiểu test này chưa?"

## Testing Best Practices

1. **AAA Pattern**:
   ```typescript
   // Arrange - Setup data and mocks
   const mockUser = { id: '1', email: 'test@test.com' };
   prisma.user.findUnique.mockResolvedValue(mockUser);

   // Act - Call the method
   const result = await service.findOne('1');

   // Assert - Check results
   expect(result).toEqual(mockUser);
   ```

2. **Mocking Prisma**:
   ```typescript
   const mockPrisma = {
     user: {
       findUnique: jest.fn(),
       findMany: jest.fn(),
       create: jest.fn(),
       update: jest.fn(),
       delete: jest.fn(),
     },
   };
   ```

3. **Testing exceptions**:
   ```typescript
   it('should throw NotFoundException', async () => {
     prisma.user.findUnique.mockResolvedValue(null);

     await expect(service.findOne('999'))
       .rejects.toThrow(NotFoundException);
   });
   ```

4. **Test isolation**:
   - Each test should be independent
   - Use `beforeEach` to reset mocks
   - Don't share state between tests

## Example Usage

```
/nest-test backend/src/modules/users/users.service.ts
/nest-test backend/src/modules/auth/auth.controller.ts
```

## Run Tests

After creating tests:
```bash
# Run specific test file
pnpm run test users.service.spec.ts

# Run with coverage
pnpm run test:cov
```

## After Completion

Remind user:
- "Nhớ update TRACKPAD.md với testing patterns học được!"
- Suggest: "Chạy `pnpm run test` để verify tests pass"
- Link to Jest docs if needed
