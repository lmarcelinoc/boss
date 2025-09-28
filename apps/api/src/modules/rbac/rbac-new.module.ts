import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { RoleService } from './services/role-new.service';
import { PermissionService } from './services/permission-new.service';
import { RoleHierarchyService } from './services/role-hierarchy.service';
import { RbacSeederService } from './services/rbac-seeder.service';
import { RbacAdminController } from './controllers/rbac-admin.controller';
import { PermissionsGuard } from './guards/permissions-new.guard';
import { EnhancedRolesGuard } from './guards/enhanced-roles.guard';

@Module({
  imports: [
    DatabaseModule, // This provides PrismaService
  ],
  controllers: [
    RbacAdminController,
  ],
  providers: [
    RoleService,
    PermissionService,
    RoleHierarchyService,
    RbacSeederService,
    PermissionsGuard,
    EnhancedRolesGuard,
  ],
  exports: [
    RoleService,
    PermissionService,
    RoleHierarchyService,
    RbacSeederService,
    PermissionsGuard,
    EnhancedRolesGuard,
  ],
})
export class RBACModule {}
