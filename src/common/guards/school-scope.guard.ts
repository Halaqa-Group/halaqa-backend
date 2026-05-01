import { CanActivate, Injectable } from '@nestjs/common';

/**
 * Marker guard. The canonical school-scope check lives in repositories /
 * services that filter by `schoolId` and return 404 on mismatch (per the
 * permission decision tree, step 3). Kept as a no-op so the guard chain
 * documented in the auth skill is present for future per-route enforcement.
 */
@Injectable()
export class SchoolScopeGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}
