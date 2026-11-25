import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CommonModule } from './common/common.module.js';
import { IntegrationsModule } from './integrations/integrations.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { PermissionGuard } from './modules/auth/permissions.js';
import { SessionGuard } from './modules/auth/session.guard.js';
import { CardModule } from './modules/card/card.module.js';
import { GuestModule } from './modules/guest/guest.module.js';
import { KitchenModule } from './modules/kitchen/kitchen.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { IncidentModule } from './modules/incident/incident.module.js';
import { PosModule } from './modules/pos/pos.module.js';
import { PrintModule } from './modules/print/print.module.js';
import { HealthController } from './modules/health/health.controller.js';
import { SafetyModule } from './modules/safety/safety.module.js';
import { RecipesModule } from './modules/recipes/recipes.module.js';
import { ServiceModule } from './modules/service/service.module.js';
import { SetupModule } from './modules/setup/setup.module.js';

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
    KitchenModule,
    PrintModule,
    PosModule,
    IncidentModule,
    DashboardModule,
    GuestModule,
    CardModule,
    RecipesModule,
    SetupModule,
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
