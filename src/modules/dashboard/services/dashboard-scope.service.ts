import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';

/**
 * The set of halaqat a caller may see on the dashboard.
 * `all` = whole school (admins); otherwise an explicit id list. An empty list is
 * legal and means "nothing in scope" — every metric short-circuits to zero/empty.
 */
export type HalaqaScope = { all: true } | { all: false; halaqaIds: number[] };

/**
 * Resolves the caller's dashboard scope once, so every metric can reuse it.
 * See the `dashboard` skill: scope, then aggregate.
 */
@Injectable()
export class DashboardScopeService {
  constructor(private readonly dataSource: DataSource) {}

  isAdmin(actor: AuthenticatedUser): boolean {
    return actor.roles.some(
      (r) => r.slug === 'principal' || r.slug === 'vice_principal',
    );
  }

  /**
   * Resolves the caller's scope, optionally narrowed to a single requested
   * halaqa. The narrowing is an INTERSECTION, never a widening: a `halaqaId`
   * outside the caller's role-derived scope collapses to the empty scope
   * (zeros/empty arrays), so a teacher can never read another halaqa's figures
   * by passing its id.
   */
  async resolve(
    actor: AuthenticatedUser,
    halaqaId?: number,
  ): Promise<HalaqaScope> {
    return this.restrictTo(await this.resolveRoleScope(actor), halaqaId);
  }

  /** Intersect an already-resolved scope with a single requested halaqa. */
  restrictTo(scope: HalaqaScope, halaqaId?: number): HalaqaScope {
    if (halaqaId == null) return scope;
    if (scope.all) return { all: false, halaqaIds: [halaqaId] };
    return scope.halaqaIds.includes(halaqaId)
      ? { all: false, halaqaIds: [halaqaId] }
      : { all: false, halaqaIds: [] };
  }

  /** The role-derived scope (union of admin/supervisor/teacher access). */
  private async resolveRoleScope(
    actor: AuthenticatedUser,
  ): Promise<HalaqaScope> {
    if (this.isAdmin(actor)) return { all: true };

    const ids = new Set<number>();

    if (actor.roles.some((r) => r.slug === 'supervisor')) {
      const rows: Array<{ id: number }> = await this.dataSource.query(
        `SELECT sh.halaqa_id AS id
           FROM supervisor_halaqat sh
           JOIN halaqat h ON h.id = sh.halaqa_id
          WHERE sh.supervisor_user_id = ?
            AND h.school_id = ?
            AND h.deleted_at IS NULL`,
        [actor.id, actor.schoolId],
      );
      for (const r of rows) ids.add(Number(r.id));
    }

    if (actor.roles.some((r) => r.slug === 'teacher')) {
      const rows: Array<{ id: number }> = await this.dataSource.query(
        `SELECT ht.halaqa_id AS id
           FROM halaqa_teachers ht
           JOIN halaqat h ON h.id = ht.halaqa_id
          WHERE ht.teacher_user_id = ?
            AND ht.end_date IS NULL
            AND h.school_id = ?
            AND h.deleted_at IS NULL`,
        [actor.id, actor.schoolId],
      );
      for (const r of rows) ids.add(Number(r.id));
    }

    return { all: false, halaqaIds: [...ids] };
  }
}
