import { Controller, Get } from '@nestjs/common';
import { ENGINE_VERSION } from '@plateguard/domain';

@Controller('health')
export class HealthController {
  @Get()
  health() {
    return { ok: true, engineVersion: ENGINE_VERSION };
  }
}
