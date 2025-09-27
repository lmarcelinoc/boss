Architecture Guide
Overview
The SaaS Boilerplate Platform is built with a modern, scalable architecture that supports multi-tenancy, real-time features, and enterprise-grade security. This document outlines the system architecture, design patterns, and technical decisions. It leverages NestJS for the backend and Next.js 14 for the frontend, using Prisma ORM with a Supabase PostgreSQL database and Redis for caching and queueing.
System Architecture
High-Level Architecture
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Client    │    │  Mobile Client  │    │   API Client    │
│   (Next.js)     │    │    (Expo)       │    │   (SDK/REST)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Load Balancer │
                    │   (Nginx)       │
                    └─────────────────┘
                                 │
                    ┌─────────────────┐
                    │   API Gateway   │
                    │   (NestJS)      │
                    └─────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   WebSocket     │    │   Background    │    │   File Storage  │
│   Gateway       │    │   Jobs (BullMQ) │    │   (S3/GCS)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Database      │
                    │   (PostgreSQL)  │
                    └─────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Cache         │
                    │   (Redis)       │
                    └─────────────────┘
The backend API (NestJS) connects to a PostgreSQL database via Prisma and uses Redis for caching, queuing, and real-time communication.
Monorepo Structure
Directory Organization
saas-boilerplate/
├── apps/                          # Application packages
│   ├── api/                       # NestJS backend API
│   │   ├── src/
│   │   │   ├── modules/           # Feature modules
│   │   │   │   ├── auth/          # Authentication module
│   │   │   │   ├── users/         # User management
│   │   │   │   ├── tenants/       # Multi-tenant features
│   │   │   │   ├── billing/       # Payment & billing
│   │   │   │   ├── notifications/ # Communication system
│   │   │   │   ├── files/         # File management
│   │   │   │   ├── websocket/     # Real-time features
│   │   │   │   └── admin/         # Administrative features
│   │   │   ├── common/            # Shared utilities
│   │   │   │   ├── decorators/    # Custom decorators
│   │   │   │   ├── guards/        # Authentication guards
│   │   │   │   ├── interceptors/  # Request/response interceptors
│   │   │   │   ├── pipes/         # Validation pipes
│   │   │   │   └── filters/       # Exception filters
│   │   │   ├── config/            # Configuration
│   │   │   ├── database/          # Database setup
│   │   │   └── main.ts            # Application entry point
│   │   └── test/                  # API tests
│   ├── web/                       # Next.js 14+ frontend (App Router)
│   │   ├── src/
│   │   │   ├── app/               # App Router pages
│   │   │   ├── components/        # React components
│   │   │   │   ├── ui/            # Reusable UI components
│   │   │   │   ├── forms/         # Form components
│   │   │   │   └── layout/        # Layout components
│   │   │   ├── hooks/             # Custom React hooks
│   │   │   ├── services/          # API services
│   │   │   ├── store/             # State management
│   │   │   └── utils/             # Utility functions
│   │   └── test/                  # Frontend tests
│   └── mobile/                    # Expo mobile app
│       ├── src/
│       │   ├── app/               # Expo Router pages
│       │   ├── screens/           # Screen components
│       │   ├── components/        # Reusable components
│       │   ├── navigation/        # Navigation setup
│       │   ├── services/          # API and device services
│       │   └── constants/         # App constants
│       └── test/                  # Mobile tests
├── packages/                      # Shared packages
│   ├── shared/                    # Shared types and utilities
│   │   ├── src/
│   │   │   ├── types/             # Common TypeScript types
│   │   │   ├── utils/             # Shared utility functions
│   │   │   └── constants/         # Shared constants
│   │   └── test/
│   ├── ui/                        # Shared UI components
│   │   ├── src/
│   │   │   ├── components/        # Reusable UI components
│   │   │   └── stories/           # Storybook stories
│   │   └── test/
│   └── config/                    # Shared configuration
│       ├── src/
│       │   ├── environment.ts     # Environment configuration
│       │   └── index.ts           # Package exports
│       └── test/
├── tools/                         # Build tools and scripts
├── docs/                          # Documentation
├── tasks/                         # Development task lists
├── prisma/                        # Prisma schema and migration files
│   ├── schema.prisma              # Database schema definition
│   └── migrations/               # Database migrations
├── docker/                        # Docker configurations
└── postman/                       # API testing collections
(The repository includes a top-level prisma/ directory for the Prisma schema and migration files.)
Design Patterns
1. Modular Architecture
Each feature is organized into modules with clear boundaries:
// Example module structure
@Module({
  imports: [DatabaseModule, SharedModule],
  controllers: [UserController],
  providers: [UserService, UserRepository],
  exports: [UserService],
})
export class UserModule {}
2. Repository Pattern
Data access is abstracted through repositories:
@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }
}
3. Service Layer Pattern
Business logic is encapsulated in services:
@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly emailService: EmailService
  ) {}

  async createUser(createUserDto: CreateUserDto): Promise<User> {
    // Business logic here
  }
}
4. DTO Pattern
Data transfer objects for input validation:
export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;
}
Multi-Tenancy Architecture
Tenant Isolation Strategy
We use a shared database, single schema approach with row-level security (RLS) for tenant isolation:
-- Each table includes a tenant_id column for isolation
ALTER TABLE public.users ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);
-- Enable row-level security and add policy for tenant isolation
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.users
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
This avoids the complexity of managing separate schemas per tenant while ensuring data isolation. RLS policies at the database level guarantee that tenants cannot access each other’s data.
Tenant Context
Tenant information is passed through the request context:
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const tenantId = request.headers['x-tenant-id'];

    // Set tenant context
    TenantContext.setTenantId(tenantId);

    return next.handle();
  }
}
In practice, the tenant identifier is typically derived from the authenticated user's JWT token (embedded as a claim during login). The platform also supports an X-Tenant-ID header for internal or service calls, as shown above. Additionally, the system can map request domains or subdomains to tenant IDs, enabling custom domains per tenant without requiring a header.
Database Queries
All database queries are automatically scoped to the current tenant:
@Injectable()
export class UserRepository {
  async findAll(): Promise<User[]> {
    const tenantId = TenantContext.getTenantId();
    return this.userRepository.find({
      where: { tenantId },
    });
  }
}
Even if a query were to omit the tenant filter, the database's RLS policies would prevent any cross-tenant data from leaking.
Tenant Provisioning
New tenants (organizations) are created automatically upon a user's first login. During registration, a user does not immediately have a tenant – the JWT may carry a null or default tenant ID. On the first successful login, if the user has no tenant, the system provisions a new tenant record (using any organization details provided at sign-up, such as a company name). That user is then assigned the Owner role of the new tenant. This deferred tenant creation flow simplifies onboarding and ensures that each tenant starts with at least one Owner user.
Platform Administration & Support
Tenant ID 1 is reserved for the platform itself – it represents a global Platform Tenant that hosts the platform administrators. Super Admin users (platform staff) belong to tenant 1 and have full access to all tenant data and system settings. They use a dedicated Admin Dashboard (backed by the admin module on the backend) to manage the entire system.
For support and troubleshooting, Super Admins can securely impersonate users in any tenant. This is facilitated by a temporary PIN code: a tenant user generates or provides a one-time PIN, which the Super Admin enters to assume that user's identity within their tenant context. All impersonation actions are time-limited and audited – an audit log entry records which admin impersonated which user and when, ensuring accountability.
Security Architecture
Authentication Flow
1.	Login: User provides credentials
2.	Validation: Credentials are validated against the database
3.	Token Generation: JWT access token and refresh token are generated
4.	Response: Tokens are returned to the client
5.	Storage: Client stores tokens securely (e.g. HttpOnly cookie or secure storage)
6.	Usage: Access token is sent with each API request
After authentication, a refresh token (long-lived) is also issued. Active refresh tokens (session IDs) are stored server-side (in Redis), enabling device-specific session management and revocation (forced logout of a device if needed).
Authorization
Role-based access control with hierarchical permissions:
export enum UserRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MANAGER = 'manager',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

@Injectable()
export class RoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<string[]>(
      'roles',
      context.getHandler()
    );
    const user = context.switchToHttp().getRequest().user;

    return requiredRoles.some(role => user.roles.includes(role));
  }
}
The platform defines five tenant-scoped roles (Owner, Admin, Manager, Member, Viewer) and a platform-wide Super Admin role (in tenant 1). Permissions are checked via guards and decorators in NestJS, enforcing that a user has an adequate role for each endpoint.
Data Protection
•	Encryption at Rest: Database fields are encrypted using AES-256 (and the database volume is encrypted by the cloud provider)
•	Encryption in Transit: TLS 1.3 for all communications
•	Input Validation: Zod schemas (and class-validator DTOs) for all inputs
•	SQL Injection Prevention: Parameterized queries with Prisma
•	XSS Prevention: Content Security Policy headers and output encoding
Real-Time Architecture
WebSocket Infrastructure
@WebSocketGateway({
  namespace: 'notifications',
  cors: true,
})
export class NotificationGateway {
  @SubscribeMessage('joinRoom')
  handleJoinRoom(client: Socket, room: string): void {
    client.join(room);
  }

  @SubscribeMessage('sendMessage')
  handleMessage(client: Socket, payload: MessageDto): void {
    // Broadcast to room
    this.server.to(payload.room).emit('newMessage', payload);
  }
}
The WebSocket gateway is configured with a Redis adapter, enabling messages to be distributed across multiple server instances. This setup allows real-time features to scale horizontally; events (such as chat messages or notifications) broadcast through Redis reach all connected clients regardless of which API instance they're connected to. Clients benefit from automatic reconnection handling to maintain live updates.
Message Queuing
Background jobs are processed using BullMQ (Redis-based queue):
@Injectable()
export class EmailQueue {
  constructor(@InjectQueue('email') private emailQueue: Queue) {}

  async addEmailJob(emailData: EmailJobData): Promise<void> {
    await this.emailQueue.add('send-email', emailData, {
      attempts: 3,
      backoff: 'exponential',
    });
  }
}
Common background tasks include sending emails, generating reports, and other CPU-intensive jobs. BullMQ (backed by Redis) allows these tasks to be retried, rate-limited, and processed outside of the request/response cycle.
Performance Architecture
Caching Strategy
We employ a multi-layer caching approach:
1.	Application Cache: In-memory cache (per instance) for frequently accessed data
2.	Redis Cache: Distributed cache for shared data (available to all instances, e.g. session data, ephemeral AI assistant context)
3.	CDN Cache: Edge caching of static assets and cacheable API responses
4.	Database Cache: Query result caching via materialized views or cached procedures for expensive queries
Redis is used heavily as a caching layer, as well as for storing session state and transient context (for example, the context of an AI assistant conversation). This ensures low-latency access to frequently used data and ephemeral state across the cluster.
Database Optimization
•	Connection Pooling: Configurable connection pools for efficient database access
•	Query Optimization: Proper indexing and query planning for fast reads
•	Read Replicas: Use of read replicas for scaling read-heavy workloads
•	Sharding: (Planned) Horizontal partitioning for very large datasets or geographical distribution
API Performance
•	Rate Limiting: Configurable limits per user/tenant and endpoint to prevent abuse
•	Response Caching: HTTP response caching for frequently requested resources
•	Compression: Gzip or Brotli compression for API responses to reduce payload size
•	Pagination: Consistent and efficient pagination for endpoints returning large data sets
Monitoring & Observability
Health Checks
@Controller('health')
export class HealthController {
  @Get()
  async check(): Promise<HealthCheckResult> {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        database: await this.checkDatabase(),
        redis: await this.checkRedis(),
        email: await this.checkEmailService(),
      },
    };
  }
}
(The health check endpoint verifies connectivity and status of key services like the database, Redis, and email provider.)
Logging
Structured logging with multiple levels is implemented throughout the platform:
@Injectable()
export class LoggerService {
  private logger = new Logger(LoggerService.name);

  log(message: string, context?: string): void {
    this.logger.log(message, context);
  }

  error(message: string, trace?: string, context?: string): void {
    this.logger.error(message, trace, context);
  }
}
All application logs are emitted in a structured JSON format. These logs can be forwarded to a centralized logging system such as Grafana Loki or SigNoz for aggregation and analysis. Using such an open-source logging stack, developers and operators can search and filter logs via a web UI (Grafana or SigNoz dashboard), which greatly aids debugging and monitoring.
Metrics
Application metrics are recorded using Prometheus conventions:
@Injectable()
export class MetricsService {
  private requestCounter = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status'],
  });

  incrementRequest(method: string, route: string, status: number): void {
    this.requestCounter.inc({ method, route, status });
  }
}
Using these health checks, logs, and metrics, the platform achieves robust observability. Teams can set up alerts (e.g. via Prometheus Alertmanager) and integrate OpenTelemetry for distributed tracing if required. An open-source observability tool like SigNoz can correlate logs, metrics, and traces to provide a comprehensive view of system behavior.
Deployment Architecture
Container Strategy
•	Multi-stage builds for optimized production Docker images
•	Non-root containers to enhance security
•	Health checks configured for container orchestration (ensure automatic restarts on failure)
•	Resource limits (CPU/memory) on containers for stability and fair usage
Environment Management
•	Environment-specific configurations are used for development, staging, and production (via .env files or environment variables)
•	Secrets management is handled through external secret stores (e.g. Vault or cloud-specific secret managers)
•	Configuration validation at startup ensures all required vars are set
•	Feature flags allow gradual roll-out of features per environment or tenant
Scaling Strategy
•	Horizontal scaling: The application can run multiple stateless API instances behind a load balancer
•	Auto-scaling: Instances can be automatically added or removed based on CPU/memory or request metrics
•	Database scaling: Read replicas and optimized indexes handle increased load; connection pooling mitigates overhead
•	Cache scaling: Redis can be clustered or use read replicas for larger workloads
Development Workflow
Code Quality
•	TypeScript strict mode for type safety across the codebase
•	ESLint and Prettier to enforce coding standards and format
•	Pre-commit hooks (via Husky) to run linters/tests before commits
•	Conventional commits style for structured commit messages and changelog generation
Testing Strategy
•	Unit tests for core business logic (Jest + ts-jest)
•	Integration tests for API endpoints and services (using a test database)
•	E2E tests for user workflows through the application (Playwright or Cypress)
•	Performance tests for load testing critical endpoints
•	Coverage: Code coverage is measured, aiming for at least 85% to maintain quality
CI/CD Pipeline
Continuous integration and deployment are handled via GitHub Actions. On each commit, an automated pipeline runs through the following stages:
1.	Code Quality: Linting and formatting checks
2.	Testing: Unit, integration, and E2E tests (with coverage reports)
3.	Coverage: Code coverage check and reporting
4.	Security: Vulnerability scanning (GitHub Dependabot, Snyk, etc.)
5.	Build: Docker image creation (multi-stage build)
6.	Deploy: Deployment to staging, then production (with manual approval for production)
(CI/CD is configured to run tests and checks on every pull request, and to deploy automatically on push to main, using infrastructure-as-code for consistency across environments.)
Conclusion
This architecture provides a solid foundation for building scalable, secure, and maintainable SaaS applications. The modular design allows for easy extension and modification while maintaining clear separation of concerns and following industry best practices. With a robust multi-tenant strategy, built-in observability, and a streamlined developer workflow, the platform is equipped to accelerate development without sacrificing quality or security.
________________________________________
🔐 Role Hierarchy & Permissions Guide
Overview
This document describes the comprehensive role hierarchy implemented in the SaaS Boilerplate system. The role system provides granular access control with 6 distinct roles, each with specific permissions and responsibilities. Super Admin is a platform-level role residing in the global tenant (ID 1) with system-wide access, whereas the other roles (Owner through Viewer) apply within individual tenants.
🏗️ Role Hierarchy
Level 1: System Administrators
•	🔐 Super Admin - Ultimate system administrator with ALL permissions
•	👑 Owner - Tenant owner with full access to all tenant resources
Level 2: Management
•	⚙️ Admin - Administrator with management permissions, no system settings
Level 3: Team Management
•	👥 Manager - Team manager with user and team management permissions
Level 4: Operations
•	📝 Member - Regular member with basic operational permissions
Level 5: Read-Only
•	👁️ Viewer - Read-only access to assigned resources
📊 Permission Summary
Role	Level	Permissions	Description
Super Admin	1	132	🔐 ALL PERMISSIONS (system-wide)
Owner	1	132	👑 ALL PERMISSIONS (tenant-specific)
Admin	2	121	⚙️ MANAGEMENT (no system settings)
Manager	3	55	👥 TEAM MANAGEMENT
Member	4	16	📝 BASIC OPERATIONS
Viewer	5	24	👁️ READ-ONLY
🔑 Detailed Role Permissions
🔐 Super Admin (Level 1)
Permissions: 132 total - ALL system permissions
Super Admin accounts belong to the Platform tenant (ID 1) and have full, unrestricted access across all tenants.
Capabilities:
•	Full system access and control
•	Can manage all tenants, users, roles, and permissions
•	Can access system settings and configurations
•	Can perform any action on any resource
•	Can create, modify, and delete any system component
•	Can impersonate any tenant user for support (requires a temporary PIN code from the user)
Use Cases:
•	System administrators
•	Platform administrators (tenant 1)
•	Emergency access scenarios
👑 Owner (Level 1)
Permissions: 132 total - ALL permissions (tenant-specific)
Capabilities:
•	Full access to all tenant resources
•	Can manage users, roles, and permissions within their tenant
•	Can configure tenant-specific settings
•	Cannot access system-level settings (reserved for Super Admin)
Use Cases:
•	First user of a new tenant (automatically assigned as Owner)
•	Tenant owners
•	Organization administrators
•	Primary account holders
⚙️ Admin (Level 2)
Permissions: 121 total - Management permissions (no system settings)
Capabilities:
•	Can manage users, roles, teams, and most resources
•	Cannot access system settings
•	Can approve/reject operations
•	Can import/export data
•	Can assign/revoke permissions
Resources Accessible:
•	✅ users (all actions except system settings)
•	✅ roles (all actions)
•	✅ permissions (all actions)
•	✅ tenants (all actions)
•	✅ teams (all actions)
•	✅ sessions (all actions)
•	✅ billing (all actions)
•	✅ subscriptions (all actions)
•	✅ files (all actions)
•	✅ notifications (all actions)
•	✅ reports (all actions)
•	❌ system_settings (no access)
Use Cases:
•	Department administrators
•	IT managers
•	Senior managers
👥 Manager (Level 3)
Permissions: 55 total - Team and user management
Capabilities:
•	Can manage teams and team members
•	Can manage users within their scope
•	Can handle files, notifications, and reports
•	Cannot access billing or system settings
Resources Accessible:
•	✅ users (all actions)
•	✅ teams (all actions)
•	✅ files (all actions)
•	✅ notifications (all actions)
•	✅ reports (all actions)
•	❌ roles (no access)
•	❌ permissions (no access)
•	❌ tenants (no access)
•	❌ sessions (no access)
•	❌ billing (no access)
•	❌ subscriptions (no access)
•	❌ system_settings (no access)
Use Cases:
•	Team leaders
•	Project managers
•	Department supervisors
📝 Member (Level 4)
Permissions: 16 total - Basic operations
Capabilities:
•	Can create, read, update, and export basic resources
•	Cannot delete or manage other users
•	Limited to operational tasks
Resources Accessible:
•	✅ files (create, read, update, export)
•	✅ notifications (create, read, update, export)
•	✅ reports (create, read, update, export)
•	✅ sessions (create, read, update, export)
•	❌ users (no access)
•	❌ teams (no access)
•	❌ roles (no access)
•	❌ permissions (no access)
•	❌ tenants (no access)
•	❌ billing (no access)
•	❌ subscriptions (no access)
•	❌ system_settings (no access)
Use Cases:
•	Regular employees
•	Content creators
•	Report generators
👁️ Viewer (Level 5)
Permissions: 24 total - Read-only access
Capabilities:
•	Can only read and export data
•	Cannot create, update, or delete anything
•	Limited to viewing assigned resources
Resources Accessible:
•	✅ All resources (read and export only)
•	❌ No create, update, delete, or manage permissions
Use Cases:
•	Auditors
•	Consultants
•	External reviewers
•	Read-only users
🎯 Permission Categories
Action Types
•	create - Can create new resources
•	read - Can view existing resources
•	update - Can modify existing resources
•	delete - Can remove resources
•	manage - Can perform administrative actions
•	approve - Can approve operations
•	reject - Can reject operations
•	export - Can export data
•	import - Can import data
•	assign - Can assign permissions/roles
•	revoke - Can revoke permissions/roles
Resource Types
•	users - User management
•	roles - Role management
•	permissions - Permission management
•	tenants - Tenant management
•	teams - Team management
•	sessions - Session management
•	billing - Billing operations
•	subscriptions - Subscription management
•	files - File management
•	notifications - Notification management
•	reports - Report generation
•	system_settings - System configuration
🚀 Implementation
Database Setup
The role hierarchy is created using the comprehensive SQL script:
# Run the role setup script
docker exec -i saas-postgres psql -U saas_user -d saas_boilerplate < 
scripts/super-admin-permissions-manager.sql
Creating Users with Specific Roles
# Example: Create an Admin user
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "Admin123!",
    "firstName": "Admin",
    "lastName": "User",
    "tenantName": "My Company",
    "acceptTerms": true
  }'

# Then assign Admin role via database
docker exec -i saas-postgres psql -U saas_user -d saas_boilerplate \
  -c "INSERT INTO \"user_roles\" (\"userId\", \"roleId\") 
      SELECT u.id, r.id FROM users u CROSS JOIN roles r 
      WHERE u.email = 'admin@example.com' AND r.name = 'Admin';"
Testing Role Permissions
# Test Super Admin permissions
./scripts/test-super-admin-permissions.sh

# Test specific role permissions
curl -X GET http://localhost:3001/api/roles/debug/user-permissions \
  -H "Authorization: Bearer YOUR_TOKEN"
🔒 Security Considerations
Principle of Least Privilege
•	Each role has only the minimum permissions necessary for their function
•	Higher-level roles inherit permissions from lower levels
•	System settings are restricted to Super Admin only
Role Inheritance
•	Level 1 roles have access to everything
•	Level 2+ roles have progressively restricted access
•	Each level builds upon the previous level's permissions
Audit Trail
•	All permission changes are logged
•	Role assignments are tracked
•	User actions are audited based on their role
•	Support impersonation sessions by Super Admins are recorded (with admin, target user, and timestamps)
📋 Best Practices
Role Assignment
1.	Start with Viewer - Assign the lowest level role initially
2.	Promote Gradually - Increase permissions as needed
3.	Regular Review - Audit role assignments periodically
4.	Temporary Elevation - Use temporary role assignments for specific tasks
Permission Management
1.	Document Changes - Keep records of permission modifications
2.	Test Permissions - Verify role permissions before deployment
3.	Monitor Usage - Track how permissions are being used
4.	Clean Up - Remove unused roles and permissions
User Onboarding
1.	Default Role - Assign Viewer role to new users
2.	Training - Educate users about their role responsibilities
3.	Escalation - Provide clear escalation paths for permission requests
4.	Review - Regular review of user role assignments
🛠️ Customization
Adding Custom Roles
To add custom roles with specific permissions:
-- Create custom role
INSERT INTO roles (name, description, level, type, "isSystem", "isActive", "createdAt", "updatedAt")
VALUES ('Custom Role', 'Description', '3'::roles_level_enum, 'custom', false, true, NOW(), NOW());

-- Assign specific permissions
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'Custom Role' AND p.name IN ('users:read', 'files:create', 'reports:export');
Modifying Existing Roles
To modify permissions for existing roles:
-- Remove specific permissions
DELETE FROM "role_permissions" rp
JOIN roles r ON rp."roleId" = r.id
JOIN permissions p ON rp."permissionId" = p.id
WHERE r.name = 'Manager' AND p.name = 'users:delete';

-- Add specific permissions
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'Manager' AND p.name = 'users:approve';
📞 Support
For questions about role hierarchy and permissions:
•	Check the API documentation for endpoint-specific permissions
•	Review the audit logs for permission changes
•	Contact system administrators for role modifications
•	Use the debug endpoint to verify user permissions
________________________________________
Last Updated: September 2025
Version: 1.1
Author: SaaS Boilerplate Team
________________________________________
