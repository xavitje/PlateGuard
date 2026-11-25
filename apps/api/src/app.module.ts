import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CommonModule } from './common/common.module.js';
import { IntegrationsModule } from './integrations/integrations.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { PermissionGuard } from './modules/auth/permissions.js';
import { SessionGuard } from './modules/auth/session.guard.js';
import { HealthController } from './modules/health/health.controller.js';
import { SafetyModule } from './modules/safety/safety.module.js';
import { RecipesModule } from './modules/recipes/recipes.module.js';
import { ServiceModule } from './modules/service/service.module.js';

/**
 * Modules from the plan: recipes, menus, service, safety, integrations, incidents, audit, reports,
 * auth, realtime. Present: auth (dev sign-in until PIN login), service (tables, seats, orders,
 * alerts), safety (engine preview), integrations (webhook intake) and health.
 */
@Module({
  imports: [
    CommonModule,
    AuthModule,
    SafetyModule,
    ServiceModule,
    RecipesModule,
    IntegrationsModule,
  ],
  controllers: [HealthController],
  // Order matters: SessionGuard sets who and where, PermissionGuard checks can().
  providers: [
    { provide: APP_GUARD, useExisting: SessionGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule {}
