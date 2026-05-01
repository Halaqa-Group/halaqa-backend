import { CanActivate, Injectable } from '@nestjs/common';

/**
 * Placeholder for the per-resource scope check (step 5 of the permission
 * decision tree). Becomes meaningful once halaqa/student modules land —
 * supervisor must own the halaqa, teacher must teach it, parent must own
 * the student. For now no-op so the guard chain is in place.
 */
@Injectable()
export class ScopeGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}
