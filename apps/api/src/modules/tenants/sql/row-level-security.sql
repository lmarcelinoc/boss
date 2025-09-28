-- Row-Level Security (RLS) Policies for Multi-Tenant Isolation
-- This script sets up PostgreSQL RLS policies to enforce tenant isolation at the database level

-- Enable Row-Level Security for tenant-scoped tables
BEGIN;

-- 1. USERS Table - Users can only see users from their own tenant
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy for users to see only their tenant's users
CREATE POLICY tenant_isolation_users ON users
    FOR ALL
    TO PUBLIC
    USING (
        -- Allow if user is accessing their own tenant
        tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid
        OR
        -- Allow Super Admins to see all users (they belong to platform tenant)
        current_setting('app.current_tenant_id', TRUE)::uuid = (
            SELECT id FROM tenants WHERE slug = 'platform' LIMIT 1
        )
    );

-- 2. FILES Table - Files scoped by tenant
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_files ON files
    FOR ALL
    TO PUBLIC
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid
        OR
        current_setting('app.current_tenant_id', TRUE)::uuid = (
            SELECT id FROM tenants WHERE slug = 'platform' LIMIT 1
        )
    );

-- 3. NOTIFICATIONS Table - Notifications scoped by tenant
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_notifications ON notifications
    FOR ALL
    TO PUBLIC
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid
        OR
        current_setting('app.current_tenant_id', TRUE)::uuid = (
            SELECT id FROM tenants WHERE slug = 'platform' LIMIT 1
        )
    );

-- 4. SUBSCRIPTIONS Table - Subscriptions scoped by tenant
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_subscriptions ON subscriptions
    FOR ALL
    TO PUBLIC
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid
        OR
        current_setting('app.current_tenant_id', TRUE)::uuid = (
            SELECT id FROM tenants WHERE slug = 'platform' LIMIT 1
        )
    );

-- 5. TEAMS Table - Teams scoped by tenant
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_teams ON teams
    FOR ALL
    TO PUBLIC
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid
        OR
        current_setting('app.current_tenant_id', TRUE)::uuid = (
            SELECT id FROM tenants WHERE slug = 'platform' LIMIT 1
        )
    );

-- 6. INVITATIONS Table - Invitations scoped by tenant
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_invitations ON invitations
    FOR ALL
    TO PUBLIC
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid
        OR
        current_setting('app.current_tenant_id', TRUE)::uuid = (
            SELECT id FROM tenants WHERE slug = 'platform' LIMIT 1
        )
    );

-- 7. TENANT_FEATURE_FLAGS Table - Feature flags scoped by tenant
ALTER TABLE tenant_feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_tenant_feature_flags ON tenant_feature_flags
    FOR ALL
    TO PUBLIC
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid
        OR
        current_setting('app.current_tenant_id', TRUE)::uuid = (
            SELECT id FROM tenants WHERE slug = 'platform' LIMIT 1
        )
    );

-- 8. TENANT_USAGE Table - Usage metrics scoped by tenant
ALTER TABLE tenant_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_tenant_usage ON tenant_usage
    FOR ALL
    TO PUBLIC
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid
        OR
        current_setting('app.current_tenant_id', TRUE)::uuid = (
            SELECT id FROM tenants WHERE slug = 'platform' LIMIT 1
        )
    );

-- 9. BULK_IMPORT_JOBS Table - Import jobs scoped by tenant
ALTER TABLE bulk_import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_bulk_import_jobs ON bulk_import_jobs
    FOR ALL
    TO PUBLIC
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid
        OR
        current_setting('app.current_tenant_id', TRUE)::uuid = (
            SELECT id FROM tenants WHERE slug = 'platform' LIMIT 1
        )
    );

-- 10. USAGE_ANALYTICS Table - Analytics scoped by tenant
ALTER TABLE usage_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_usage_analytics ON usage_analytics
    FOR ALL
    TO PUBLIC
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid
        OR
        current_setting('app.current_tenant_id', TRUE)::uuid = (
            SELECT id FROM tenants WHERE slug = 'platform' LIMIT 1
        )
    );

-- 11. ANALYTICS_AGGREGATES Table - Analytics aggregates scoped by tenant
ALTER TABLE analytics_aggregates ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_analytics_aggregates ON analytics_aggregates
    FOR ALL
    TO PUBLIC
    USING (
        tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid
        OR
        current_setting('app.current_tenant_id', TRUE)::uuid = (
            SELECT id FROM tenants WHERE slug = 'platform' LIMIT 1
        )
    );

-- 12. AUDIT_LOGS Table - Audit logs with special handling
-- Audit logs need more complex rules since they track cross-tenant activities for Super Admins
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_audit_logs ON audit_logs
    FOR ALL
    TO PUBLIC
    USING (
        -- Users can see audit logs for their own tenant
        (
            tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid
            AND tenant_id IS NOT NULL
        )
        OR
        -- Super Admins can see all audit logs
        current_setting('app.current_tenant_id', TRUE)::uuid = (
            SELECT id FROM tenants WHERE slug = 'platform' LIMIT 1
        )
        OR
        -- Users can see their own audit logs regardless of tenant context
        (
            user_id IS NOT NULL 
            AND user_id = current_setting('app.current_user_id', TRUE)::uuid
        )
    );

-- Create helper functions for RLS policies
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS UUID AS $$
BEGIN
    RETURN current_setting('app.current_tenant_id', TRUE)::uuid;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS UUID AS $$
BEGIN
    RETURN current_setting('app.current_user_id', TRUE)::uuid;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN current_setting('app.current_tenant_id', TRUE)::uuid = (
        SELECT id FROM tenants WHERE slug = 'platform' LIMIT 1
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to set tenant context (called by application)
CREATE OR REPLACE FUNCTION set_tenant_context(p_tenant_id UUID, p_user_id UUID DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
    -- Set the tenant ID for RLS policies
    PERFORM set_config('app.current_tenant_id', p_tenant_id::text, TRUE);
    
    -- Set the user ID if provided
    IF p_user_id IS NOT NULL THEN
        PERFORM set_config('app.current_user_id', p_user_id::text, TRUE);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to clear tenant context
CREATE OR REPLACE FUNCTION clear_tenant_context()
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_tenant_id', NULL, TRUE);
    PERFORM set_config('app.current_user_id', NULL, TRUE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions on helper functions
GRANT EXECUTE ON FUNCTION get_current_tenant_id() TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_current_user_id() TO PUBLIC;
GRANT EXECUTE ON FUNCTION is_platform_admin() TO PUBLIC;
GRANT EXECUTE ON FUNCTION set_tenant_context(UUID, UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION clear_tenant_context() TO PUBLIC;

COMMIT;

-- Note: Tables that should NOT have RLS enabled (system-wide data):
-- - tenants (tenants table itself - managed by platform)
-- - roles (system roles are global)
-- - permissions (permissions are global)
-- - role_permissions (role-permission mappings are global)
-- - user_roles (user role assignments - handled by application logic)
-- - plans (subscription plans are global)
-- - refresh_tokens (managed by user authentication)
-- - sessions (managed by user authentication)
-- - user_profiles (could be tenant-scoped but currently follows users)

-- Test queries to verify RLS is working:
/*
-- Set context as a regular tenant user
SELECT set_tenant_context('tenant-uuid-here', 'user-uuid-here');

-- This should only show users from the current tenant
SELECT count(*) FROM users;

-- This should only show files from the current tenant
SELECT count(*) FROM files;

-- Clear context
SELECT clear_tenant_context();

-- Without context, queries should return no results (unless Super Admin)
SELECT count(*) FROM users;
*/
