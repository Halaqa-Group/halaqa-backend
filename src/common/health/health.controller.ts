import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';

/**
 * Liveness/readiness probe for load balancers and container orchestrators.
 * Mounted outside the `api` global prefix at `/health`. A failing DB ping
 * surfaces as a 500 via the global exception filter.
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  @ApiOperation({ summary: 'Service health (checks DB connectivity)' })
  async check(): Promise<{ status: 'ok'; db: 'up' }> {
    await this.dataSource.query('SELECT 1');
    return { status: 'ok', db: 'up' };
  }
}
