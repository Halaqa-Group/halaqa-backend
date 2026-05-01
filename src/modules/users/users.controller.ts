import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiMessage } from '../../common/api-message';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ErrorEnvelope, MessageEnvelope } from '../auth/dto/auth.responses';
import { AdminResetPasswordDto } from './dto/admin-reset-password.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQuery } from './dto/list-users.query';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserEnvelope, UserListEnvelope } from './dto/user.responses';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @Roles('principal')
  @Audit('user.create')
  @ApiOperation({
    summary: 'Create a user (principal only)',
    description:
      'Hashes the password (bcrypt cost 12) and optionally assigns role slugs in the same transaction. ' +
      'Cannot create a user in another school — `school_id` is taken from the caller.',
  })
  @ApiResponse({ status: 201, type: UserEnvelope })
  @ApiResponse({
    status: 409,
    description: 'Email already in use',
    type: ErrorEnvelope,
  })
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.users.create(dto, actor);
  }

  @Get()
  @Roles('principal', 'vice_principal')
  @ApiOperation({
    summary: 'List users (principal, vice_principal)',
    description:
      'Paginated and school-scoped. Soft-deleted users are excluded. Filters: ' +
      '`search` (substring on name/email), `role` (slug), `status`.',
  })
  @ApiResponse({ status: 200, type: UserListEnvelope })
  list(
    @Query() query: ListUsersQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.findAll(query, actor.schoolId);
  }

  @Get(':id')
  @Roles('principal', 'vice_principal')
  @ApiOperation({
    summary: 'Get one user by id (principal, vice_principal)',
    description:
      'Cross-school requests return 404, never 403, so user IDs are not enumerable across tenants.',
  })
  @ApiResponse({ status: 200, type: UserEnvelope })
  @ApiResponse({ status: 404, type: ErrorEnvelope })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.findOne(id, actor.schoolId);
  }

  @Patch(':id')
  @Roles('principal')
  @Audit('user.update')
  @ApiOperation({
    summary: 'Update a user (principal only)',
    description:
      'Cannot change email, school_id, or roles. Switching status to `inactive`/`suspended` bumps the ' +
      "user's `tokenVersion` and revokes every active refresh token (BR-USR-07).",
  })
  @ApiResponse({ status: 200, type: UserEnvelope })
  @ApiResponse({ status: 404, type: ErrorEnvelope })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.update(id, dto, actor);
  }

  @Delete(':id')
  @Roles('principal')
  @HttpCode(204)
  @Audit('user.delete')
  @ApiOperation({
    summary: 'Soft-delete a user (principal only)',
    description:
      'Sets `deleted_at`, bumps `tokenVersion`, and revokes every active refresh token. The principal ' +
      'cannot delete their own account.',
  })
  @ApiResponse({ status: 204, description: 'User soft-deleted (no body)' })
  @ApiResponse({
    status: 400,
    description: 'Cannot delete self',
    type: ErrorEnvelope,
  })
  @ApiResponse({ status: 404, type: ErrorEnvelope })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.users.softDelete(id, actor);
  }

  @Post(':id/roles')
  @Roles('principal')
  @Audit('user.role.assign')
  @ApiOperation({
    summary: 'Assign a role to a user (principal only)',
    description:
      'Idempotent — assigning a role the user already holds is a no-op. The actor is recorded in ' +
      'user_roles.assigned_by.',
  })
  @ApiResponse({ status: 201, type: UserEnvelope })
  @ApiResponse({
    status: 400,
    description: 'Unknown role',
    type: ErrorEnvelope,
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
    type: ErrorEnvelope,
  })
  assignRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.assignRole(id, dto.roleId, actor);
  }

  @Delete(':id/roles/:roleId')
  @Roles('principal')
  @HttpCode(200)
  @Audit('user.role.remove')
  @ApiOperation({
    summary: 'Remove a role from a user (principal only)',
  })
  @ApiResponse({ status: 200, type: UserEnvelope })
  @ApiResponse({
    status: 404,
    description: 'User or role mapping not found',
    type: ErrorEnvelope,
  })
  removeRole(
    @Param('id', ParseIntPipe) id: number,
    @Param('roleId', ParseIntPipe) roleId: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.removeRole(id, roleId, actor);
  }

  @Post(':id/reset-password')
  @Roles('principal')
  @HttpCode(200)
  @Audit('user.password.reset_by_admin')
  @ApiOperation({
    summary: "Reset another user's password (principal only) — BR-USR-05",
    description:
      'Hashes the supplied password with bcrypt cost 12, bumps `tokenVersion`, and revokes every ' +
      'active refresh token for the target user (`admin_action`).',
  })
  @ApiResponse({ status: 200, type: MessageEnvelope })
  @ApiResponse({
    status: 400,
    description: 'Confirmation mismatch',
    type: ErrorEnvelope,
  })
  @ApiResponse({ status: 404, type: ErrorEnvelope })
  async adminResetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminResetPasswordDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ApiMessage> {
    await this.users.adminResetPassword(id, dto, actor);
    return new ApiMessage('Password has been reset');
  }
}
