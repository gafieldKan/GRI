import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async health() {
    let dbOk = true;
    try {
      await this.db.query('SELECT 1');
    } catch {
      dbOk = false;
    }
    return { status: 'ok', db: dbOk ? 'up' : 'down' };
  }
}