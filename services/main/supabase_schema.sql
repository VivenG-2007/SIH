-- ====================================================================
-- PatchlineX Supabase Database Schema
-- Run this in your Supabase Project -> SQL Editor
-- ====================================================================

-- 1. Watched Repositories
-- Registry of GitHub repositories monitored by PatchlineX for webhooks & scans
CREATE TABLE IF NOT EXISTS watched_repositories (
    repository_id TEXT PRIMARY KEY,               -- GitHub's numeric repository ID as string
    user_id TEXT NOT NULL,                        -- PatchlineX user ID who owns/registered this watch
    organization_id TEXT,                         -- Organization ID for multi-tenant scoping
    github_repo TEXT NOT NULL,                    -- "owner/repo" format
    branch TEXT NOT NULL DEFAULT 'main',          -- Monitored default branch
    installation_id TEXT,                         -- GitHub App installation ID (optional)
    webhook_id TEXT,                              -- GitHub webhook ID for delete / idempotent re-create
    webhook_active BOOLEAN NOT NULL DEFAULT FALSE,-- Active status of repository webhook
    auto_rescan BOOLEAN NOT NULL DEFAULT TRUE,    -- If true, git push triggers automatic rescan
    last_scan_id TEXT,                            -- ID of the most recent scan
    last_scanned_commit TEXT,                     -- SHA of the last scanned commit
    findings_count INTEGER,                       -- Vulnerability / finding count from last scan
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_watched_repositories_user_id ON watched_repositories(user_id);
CREATE INDEX IF NOT EXISTS idx_watched_repositories_org_id ON watched_repositories(organization_id);
CREATE INDEX IF NOT EXISTS idx_watched_repositories_github_repo ON watched_repositories(github_repo);


-- 2. GitHub Connections (Classic OAuth per-user integration)
-- Stored OAuth tokens encrypted at rest via AES-256-GCM
CREATE TABLE IF NOT EXISTS github_connections (
    user_id TEXT PRIMARY KEY,                     -- PatchlineX user ID
    github_user_id BIGINT NOT NULL,               -- GitHub user ID
    username TEXT NOT NULL,                       -- GitHub handle/username
    avatar_url TEXT,                              -- GitHub user avatar
    access_token TEXT NOT NULL,                   -- Encrypted access token
    scopes TEXT,                                  -- Granted OAuth scopes (repo, user:email, etc.)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- 3. GitHub App Installations (Modern GitHub App integration)
CREATE TABLE IF NOT EXISTS github_app_installations (
    user_id TEXT PRIMARY KEY,                     -- PatchlineX user ID
    installation_id TEXT NOT NULL,                -- GitHub App installation ID
    account_login TEXT NOT NULL,                  -- GitHub account name (User or Org)
    account_type TEXT,                            -- 'User' or 'Organization'
    account_avatar_url TEXT,                      -- GitHub avatar URL
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_github_app_installations_inst_id ON github_app_installations(installation_id);


-- 4. Jira Connections (Jira Cloud 3LO OAuth integration)
-- Stored Jira tokens encrypted at rest via AES-256-GCM
CREATE TABLE IF NOT EXISTS jira_connections (
    user_id TEXT PRIMARY KEY,                     -- PatchlineX user ID
    cloud_id TEXT NOT NULL,                       -- Atlassian Cloud ID
    site_url TEXT,                                -- https://your-domain.atlassian.net
    site_name TEXT,                               -- Atlassian site name
    access_token TEXT NOT NULL,                   -- Encrypted access token
    refresh_token TEXT NOT NULL,                  -- Encrypted refresh token
    expires_at TIMESTAMPTZ NOT NULL,              -- Token expiry timestamp
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jira_connections_cloud_id ON jira_connections(cloud_id);


-- ====================================================================
-- Auto-update `updated_at` trigger function
-- ====================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_watched_repositories_updated_at ON watched_repositories;
CREATE TRIGGER trg_watched_repositories_updated_at
    BEFORE UPDATE ON watched_repositories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_github_connections_updated_at ON github_connections;
CREATE TRIGGER trg_github_connections_updated_at
    BEFORE UPDATE ON github_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_github_app_installations_updated_at ON github_app_installations;
CREATE TRIGGER trg_github_app_installations_updated_at
    BEFORE UPDATE ON github_app_installations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_jira_connections_updated_at ON jira_connections;
CREATE TRIGGER trg_jira_connections_updated_at
    BEFORE UPDATE ON jira_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
