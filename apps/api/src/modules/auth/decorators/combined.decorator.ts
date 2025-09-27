import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { EnhancedAuthGuard } from '../guards/enhanced-auth.guard';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { 
  Role, 
  Roles, 
  RequireTenant, 
  RequireMfa,
  RequireOwner,
  RequireAdmin,
  RequireManager,
  RequireMember,
  RequireViewer,
  RequireAdminOrOwner,
  RequireManagerOrHigher,
  RequireMemberOrHigher,
} from './auth.decorator';
import { UserRole } from '@app/shared';

/**
 * Base authenticated decorator with Swagger documentation
 */
export const Authenticated = () => applyDecorators(
  UseGuards(JwtAuthGuard),
  ApiBearerAuth(),
  ApiUnauthorizedResponse({ description: 'Unauthorized' }),
);

/**
 * Enhanced authentication with full permission checking
 */
export const EnhancedAuth = () => applyDecorators(
  UseGuards(EnhancedAuthGuard),
  ApiBearerAuth(),
  ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  ApiForbiddenResponse({ description: 'Forbidden - Insufficient permissions' }),
);

/**
 * Authenticated with tenant context required
 */
export const AuthenticatedTenant = () => applyDecorators(
  UseGuards(EnhancedAuthGuard),
  RequireTenant(),
  ApiBearerAuth(),
  ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  ApiForbiddenResponse({ description: 'Forbidden - Tenant context required' }),
);

/**
 * Authenticated with MFA requirement
 */
export const AuthenticatedMfa = () => applyDecorators(
  UseGuards(EnhancedAuthGuard),
  RequireMfa(),
  ApiBearerAuth(),
  ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  ApiForbiddenResponse({ description: 'Forbidden - MFA verification required' }),
);

/**
 * Authenticated with specific role requirement
 */
export const AuthenticatedWithRole = (role: UserRole) => applyDecorators(
  UseGuards(EnhancedAuthGuard),
  Role(role),
  ApiBearerAuth(),
  ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  ApiForbiddenResponse({ description: `Forbidden - ${role} role required` }),
);

/**
 * Authenticated with multiple role options
 */
export const AuthenticatedWithRoles = (...roles: UserRole[]) => applyDecorators(
  UseGuards(EnhancedAuthGuard),
  Roles(...roles),
  ApiBearerAuth(),
  ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  ApiForbiddenResponse({ description: `Forbidden - One of [${roles.join(', ')}] roles required` }),
);

// Convenience decorators for specific roles

/**
 * Owner-only endpoint
 */
export const OwnerOnly = () => applyDecorators(
  UseGuards(EnhancedAuthGuard),
  RequireOwner(),
  RequireTenant(),
  ApiBearerAuth(),
  ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  ApiForbiddenResponse({ description: 'Forbidden - Owner role required' }),
);

/**
 * Admin-only endpoint
 */
export const AdminOnly = () => applyDecorators(
  UseGuards(EnhancedAuthGuard),
  RequireAdmin(),
  RequireTenant(),
  ApiBearerAuth(),
  ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  ApiForbiddenResponse({ description: 'Forbidden - Admin role required' }),
);

/**
 * Admin or Owner endpoint
 */
export const AdminOrOwnerOnly = () => applyDecorators(
  UseGuards(EnhancedAuthGuard),
  RequireAdminOrOwner(),
  RequireTenant(),
  ApiBearerAuth(),
  ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  ApiForbiddenResponse({ description: 'Forbidden - Admin or Owner role required' }),
);

/**
 * Manager or higher endpoint
 */
export const ManagerOrHigher = () => applyDecorators(
  UseGuards(EnhancedAuthGuard),
  RequireManagerOrHigher(),
  RequireTenant(),
  ApiBearerAuth(),
  ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  ApiForbiddenResponse({ description: 'Forbidden - Manager or higher role required' }),
);

/**
 * Member or higher endpoint (all authenticated users with a role)
 */
export const MemberOrHigher = () => applyDecorators(
  UseGuards(EnhancedAuthGuard),
  RequireMemberOrHigher(),
  RequireTenant(),
  ApiBearerAuth(),
  ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  ApiForbiddenResponse({ description: 'Forbidden - Member or higher role required' }),
);

/**
 * Viewer or higher endpoint (any authenticated user)
 */
export const ViewerOrHigher = () => applyDecorators(
  UseGuards(EnhancedAuthGuard),
  RequireViewer(),
  RequireTenant(),
  ApiBearerAuth(),
  ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  ApiForbiddenResponse({ description: 'Forbidden - Authentication required' }),
);

/**
 * Sensitive operation requiring MFA
 */
export const SensitiveOperation = () => applyDecorators(
  UseGuards(EnhancedAuthGuard),
  RequireMfa(),
  RequireTenant(),
  ApiBearerAuth(),
  ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  ApiForbiddenResponse({ description: 'Forbidden - MFA verification required for sensitive operations' }),
);

/**
 * High-privilege operation (Admin/Owner + MFA)
 */
export const HighPrivilegeOperation = () => applyDecorators(
  UseGuards(EnhancedAuthGuard),
  RequireAdminOrOwner(),
  RequireMfa(),
  RequireTenant(),
  ApiBearerAuth(),
  ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  ApiForbiddenResponse({ description: 'Forbidden - Admin/Owner role and MFA verification required' }),
);

/**
 * Super Admin operation (platform-level)
 */
export const SuperAdminOnly = () => applyDecorators(
  UseGuards(EnhancedAuthGuard),
  Role(UserRole.SUPER_ADMIN),
  ApiBearerAuth(),
  ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  ApiForbiddenResponse({ description: 'Forbidden - Super Admin role required' }),
);

