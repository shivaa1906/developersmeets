-- ============================================================================
-- NEXUS PLATFORM MIGRATION 005: PROJECT TASKS AND DELIVERABLE FILES
-- Governance: CEO Ritesh Lingamallu & MD M. Shiva Gopi
-- ============================================================================

-- 1. PROJECT TASKS
CREATE TABLE IF NOT EXISTS project_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    milestone_id UUID REFERENCES project_milestones(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    assignee_developer_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'TODO', -- 'TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_milestone ON project_tasks(milestone_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_assignee ON project_tasks(assignee_developer_id);

-- 2. PROJECT FILES / DELIVERABLES
CREATE TABLE IF NOT EXISTS project_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    milestone_id UUID REFERENCES project_milestones(id) ON DELETE SET NULL,
    file_name VARCHAR(255) NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    file_size INTEGER NOT NULL, -- size in bytes
    mime_type VARCHAR(100) NOT NULL,
    uploaded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(project_id);
CREATE INDEX IF NOT EXISTS idx_project_files_milestone ON project_files(milestone_id);
CREATE INDEX IF NOT EXISTS idx_project_files_uploader ON project_files(uploaded_by_user_id);
