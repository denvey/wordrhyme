-- Hello World Plugin Migration
-- Creates the greetings table for storing greeting messages

CREATE TABLE IF NOT EXISTS plugin_com_wordrhyme_hello_world_greetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    plugin_id TEXT NOT NULL DEFAULT 'com.wordrhyme.hello-world',
    organization_id TEXT NOT NULL,
    acl_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
    deny_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
    name TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Index for tenant isolation
CREATE INDEX IF NOT EXISTS idx_hello_world_greetings_tenant 
    ON plugin_com_wordrhyme_hello_world_greetings(tenant_id);

-- Index for plugin lookup
CREATE INDEX IF NOT EXISTS idx_hello_world_greetings_plugin 
    ON plugin_com_wordrhyme_hello_world_greetings(plugin_id);
