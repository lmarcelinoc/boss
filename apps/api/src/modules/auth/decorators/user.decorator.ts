import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator to extract the current authenticated user from the request
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

/**
 * Decorator to extract the user ID from the request
 */
export const UserId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.sub || request.user?.id;
  },
);

/**
 * Decorator to extract the user email from the request
 */
export const UserEmail = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.email;
  },
);

/**
 * Decorator to extract the user roles from the request
 */
export const UserRoles = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string[] => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.roles || [];
  },
);

/**
 * Decorator to extract the user permissions from the request
 */
export const UserPermissions = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string[] => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.permissions || [];
  },
);

/**
 * Decorator to extract the user's tenant ID from the request
 */
export const UserTenantId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.tenantId;
  },
);

/**
 * Decorator to extract a specific field from the user object
 */
export const UserField = (field: string) =>
  createParamDecorator((data: unknown, ctx: ExecutionContext): any => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.[field];
  });

/**
 * Decorator to check if the current user has a specific role
 */
export const HasRole = (role: string) =>
  createParamDecorator((data: unknown, ctx: ExecutionContext): boolean => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.roles?.includes(role) || false;
  });

/**
 * Decorator to check if the current user has a specific permission
 */
export const HasPermission = (permission: string) =>
  createParamDecorator((data: unknown, ctx: ExecutionContext): boolean => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.permissions?.includes(permission) || false;
  });

/**
 * Decorator to check if the current user has MFA enabled
 */
export const UserMfaEnabled = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): boolean => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.twoFactorEnabled || false;
  },
);

/**
 * Decorator to check if the current user's email is verified
 */
export const UserEmailVerified = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): boolean => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.emailVerified || false;
  },
);

