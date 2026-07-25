import { Module } from '@nestjs/common';
import { DashboardController } from './controllers/dashboard.controller';
import { DashboardScopeService } from './services/dashboard-scope.service';
import { DashboardService } from './services/dashboard.service';

/**
 * Read-only aggregation layer over attendance / achievements / plans / halaqat.
 * Owns no entity — it queries existing tables via the shared DataSource.
 * See the `dashboard` skill.
 */
@Module({
  controllers: [DashboardController],
  providers: [DashboardService, DashboardScopeService],
})
export class DashboardModule {}
