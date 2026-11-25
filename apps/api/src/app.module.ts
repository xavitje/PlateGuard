import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CommonModule } from './common/common.module.js';
import { IntegrationsModule } from './integrations/integrations.module.js';
import { PermissionGuard } from './modules/auth/permissions.js';
import { HealthController } from './modules/health/health.controller.js';
import { SafetyModule } from './modules/safety/safety.module.js';

/**
 * Modules from the plan: recipes, menus, service, safety, integrations, incidents, audit, reports,
 * auth, realtime. This skeleton has safety (engine preview), integrations (webhook intake) and health;
 * the others arrive with their phase.
 */
@Module({
  imports: [CommonModule, SafetyModule, IntegrationsModule],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: PermissionGuard }],
})
export class AppModule {}
