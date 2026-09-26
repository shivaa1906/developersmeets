-- DEVELOPER COMPANY PLATFORM: MASTER RELATIONAL DATABASE SCHEMA

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. USERS & ROLES
CREATE TYPE user_role AS ENUM ('CEO', 'ADMIN', 'MD', 'DEVELOPER', 'CLIENT', 'SUPPORT', 'GUEST');
CREATE TYPE user_status AS ENUM ('ACTIVE', 'PENDING_VERIFICATION', 'SUSPENDED');

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'GUEST',
    status user_status NOT NULL DEFAULT 'PENDING_VERIFICATION',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 3. DEVELOPERS
CREATE TYPE dev_availability AS ENUM ('AVAILABLE', 'BUSY', 'ON_PROJECT', 'UNAVAILABLE');
CREATE TYPE dev_verification AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED');

CREATE TABLE IF NOT EXISTS developers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(150) NOT NULL,
    bio TEXT,
    profile_image VARCHAR(500),
    avatar_url VARCHAR(500),
    location VARCHAR(150),
    role_title VARCHAR(150) NOT NULL,
    experience INTEGER NOT NULL DEFAULT 0 CHECK (experience >= 0),
    availability dev_availability NOT NULL DEFAULT 'AVAILABLE',
    verification_status dev_verification NOT NULL DEFAULT 'PENDING',
    verified_at TIMESTAMP WITH TIME ZONE,
    github_url VARCHAR(255),
    linkedin_url VARCHAR(255),
    portfolio_url VARCHAR(255),
    leetcode_url VARCHAR(255),
    kaggle_url VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_developers_username ON developers(username);
CREATE INDEX IF NOT EXISTS idx_developers_user_id ON developers(user_id);
CREATE INDEX IF NOT EXISTS idx_developers_status ON developers(verification_status);

-- 4. SKILLS & DEVELOPER_SKILLS
CREATE TABLE IF NOT EXISTS skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS developer_skills (
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    experience_level VARCHAR(50) DEFAULT 'ADVANCED',
    PRIMARY KEY (developer_id, skill_id)
);

CREATE TABLE IF NOT EXISTS experiences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    company VARCHAR(150) NOT NULL,
    role_title VARCHAR(150) NOT NULL,
    location VARCHAR(150),
    start_date DATE NOT NULL,
    end_date DATE,
    is_current BOOLEAN NOT NULL DEFAULT FALSE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_experiences_dev ON experiences(developer_id);

CREATE TABLE IF NOT EXISTS certifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    issuer VARCHAR(150) NOT NULL,
    issue_date DATE NOT NULL,
    expiration_date DATE,
    credential_id VARCHAR(150),
    credential_url VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_certifications_dev ON certifications(developer_id);

-- 5. CLIENTS
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_number VARCHAR(50) UNIQUE NOT NULL, -- e.g. "Client #001"
    company_name VARCHAR(255) NOT NULL,
    private_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    internal_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_clients_number ON clients(client_number);

-- 6. PROJECTS
CREATE TYPE project_status AS ENUM (
    'DRAFT', 'SUBMITTED', 'REVIEWING', 'OPEN_FOR_CLAIMS', 'CLAIMS_ACTIVE', 'CLAIMS_CLOSED',
    'SELECTION_PENDING', 'DEVELOPER_SELECTED', 'IN_PROGRESS', 
    'SUBMITTED_FOR_REVIEW', 'COMPLETED', 'PUBLISHED', 'CANCELLED', 
    'EXPIRED', 'DISPUTED', 'ON_HOLD'
);

CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_number VARCHAR(50) UNIQUE NOT NULL, -- e.g. "PRJ-2026-0001"
    slug VARCHAR(150) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(100) NOT NULL,
    budget_min NUMERIC(12, 2) NOT NULL CHECK (budget_min > 0),
    budget_max NUMERIC(12, 2) NOT NULL CHECK (budget_max >= budget_min),
    timeline VARCHAR(100) NOT NULL,
    requirements JSONB NOT NULL DEFAULT '[]',
    required_technologies JSONB NOT NULL DEFAULT '[]',
    attachments JSONB NOT NULL DEFAULT '[]',
    status project_status NOT NULL DEFAULT 'SUBMITTED',
    claim_cost INTEGER NOT NULL DEFAULT 1 CHECK (claim_cost >= 1),
    max_claims INTEGER NOT NULL DEFAULT 5 CHECK (max_claims >= 1),
    claim_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    selection_deadline TIMESTAMP WITH TIME ZONE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    lead_developer_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_projects_number ON projects(project_number);
CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- 7. CREDIT ACCOUNTS (LEDGER SOURCE OF TRUTH)
CREATE TABLE IF NOT EXISTS credit_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    developer_id UUID UNIQUE NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_credit_accounts_dev ON credit_accounts(developer_id);

-- 8. CREDIT TRANSACTIONS (IMMUTABLE LEDGER)
CREATE TYPE credit_tx_type AS ENUM (
    'PURCHASE', 'PROJECT_CLAIM', 'PROJECT_NOT_SELECTED_REFUND', 
    'PROJECT_CANCEL_REFUND', 'WITHDRAWAL_REFUND', 'ADMIN_ADJUSTMENT', 
    'EXPIRATION_REFUND'
);

CREATE TABLE IF NOT EXISTS credit_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    type credit_tx_type NOT NULL,
    amount INTEGER NOT NULL, -- e.g. -1 or +1
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    reference_id VARCHAR(100),
    description TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_credit_tx_dev ON credit_transactions(developer_id);
CREATE INDEX IF NOT EXISTS idx_credit_tx_project ON credit_transactions(project_id);

-- 9. PROJECT CLAIMS
CREATE TYPE claim_status AS ENUM ('CLAIMED', 'SELECTED', 'NOT_SELECTED', 'WITHDRAWN', 'DISQUALIFIED');

CREATE TABLE IF NOT EXISTS project_claims (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    credit_transaction_id UUID REFERENCES credit_transactions(id),
    status claim_status NOT NULL DEFAULT 'CLAIMED',
    anonymous_tag VARCHAR(50), -- e.g. "Developer #01"
    claimed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    selected_at TIMESTAMP WITH TIME ZONE,
    rejected_at TIMESTAMP WITH TIME ZONE,
    refund_transaction_id UUID REFERENCES credit_transactions(id),
    CONSTRAINT uq_project_developer UNIQUE (project_id, developer_id)
);
CREATE INDEX IF NOT EXISTS idx_project_claims_project ON project_claims(project_id);
CREATE INDEX IF NOT EXISTS idx_project_claims_dev ON project_claims(developer_id);

-- 10. PROPOSALS
CREATE TABLE IF NOT EXISTS proposals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_claim_id UUID UNIQUE NOT NULL REFERENCES project_claims(id) ON DELETE CASCADE,
    approach TEXT NOT NULL,
    timeline VARCHAR(100) NOT NULL,
    price NUMERIC(12, 2) NOT NULL CHECK (price > 0),
    milestones JSONB NOT NULL DEFAULT '[]',
    technologies JSONB NOT NULL DEFAULT '[]',
    additional_notes TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'SUBMITTED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. PROJECT MEMBERS
CREATE TYPE member_role AS ENUM ('LEAD', 'CONTRIBUTOR');

CREATE TABLE IF NOT EXISTS project_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    role member_role NOT NULL DEFAULT 'CONTRIBUTOR',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_project_member UNIQUE (project_id, developer_id)
);

-- 12. PAYMENTS
CREATE TYPE payment_status AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED');

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    gateway VARCHAR(50) NOT NULL,
    gateway_payment_id VARCHAR(100) UNIQUE,
    status payment_status NOT NULL DEFAULT 'PENDING',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 13. CONVERSATIONS & MESSAGES
CREATE TYPE conversation_type AS ENUM ('PROJECT_PRIVATE', 'COMMUNITY_DM', 'COMMUNITY_GROUP', 'SUPPORT_BRIDGE');

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    type conversation_type NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS conversation_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    developer_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    role VARCHAR(50) NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_read_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    message_type VARCHAR(50) NOT NULL DEFAULT 'TEXT',
    attachment_url VARCHAR(500),
    reply_to UUID REFERENCES messages(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

-- 14. COMMUNITY CHANNELS
CREATE TABLE IF NOT EXISTS channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    is_private BOOLEAN NOT NULL DEFAULT FALSE,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS channel_members (
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (channel_id, developer_id)
);

CREATE TABLE IF NOT EXISTS channel_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    author_developer_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    reply_to_id UUID REFERENCES channel_messages(id) ON DELETE SET NULL,
    mentions JSONB DEFAULT '[]',
    attachments JSONB DEFAULT '[]',
    has_code_block BOOLEAN DEFAULT FALSE,
    is_edited BOOLEAN NOT NULL DEFAULT FALSE,
    edited_at TIMESTAMP WITH TIME ZONE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    pinned_at TIMESTAMP WITH TIME ZONE,
    pinned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    moderated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    moderation_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_channel_messages_channel ON channel_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_messages_reply ON channel_messages(reply_to_id);
CREATE INDEX IF NOT EXISTS idx_channel_messages_created ON channel_messages(created_at);

CREATE TABLE IF NOT EXISTS channel_message_reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES channel_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    developer_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    emoji VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_reactions_message ON channel_message_reactions(message_id);

-- 15. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);

-- 16. SUPPORT TICKETS & BRIDGES
CREATE TYPE ticket_priority AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE ticket_status AS ENUM ('OPEN', 'ASSIGNED', 'INVESTIGATING', 'WAITING_FOR_CLIENT', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_number VARCHAR(50) UNIQUE NOT NULL, -- e.g. "SUP-2026-0001"
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    developer_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    subject VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    priority ticket_priority NOT NULL DEFAULT 'NORMAL',
    status ticket_status NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS support_bridges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID UNIQUE NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    bridge_number VARCHAR(50),
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS support_bridge_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bridge_id UUID NOT NULL REFERENCES support_bridges(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL -- 'CLIENT', 'SUPPORT', 'DEVELOPER'
);

-- 17. PROJECT MILESTONES
CREATE TYPE milestone_status AS ENUM ('PENDING', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED', 'COMPLETED');

CREATE TABLE IF NOT EXISTS project_milestones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status milestone_status NOT NULL DEFAULT 'PENDING',
    due_date TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    order_index INTEGER NOT NULL DEFAULT 0
);

-- 18. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- 19. ADDITIONAL PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category);
CREATE INDEX IF NOT EXISTS idx_conversation_members_conv ON conversation_members(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_members_user ON conversation_members(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_project ON support_tickets(project_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_client ON support_tickets(client_id);

-- 20. INQUIRIES & DEVELOPER PROFILE VIEWS
CREATE TABLE IF NOT EXISTS inquiries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    client_tag VARCHAR(50) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    preview TEXT,
    message TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'NEW',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_inquiries_developer ON inquiries(developer_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_client ON inquiries(client_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries(status);

CREATE TABLE IF NOT EXISTS developer_profile_views (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    viewer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    viewer_ip VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_profile_views_developer ON developer_profile_views(developer_id);

-- 21. PROJECT TASKS & DELIVERABLE FILES
CREATE TABLE IF NOT EXISTS project_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    milestone_id UUID REFERENCES project_milestones(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    assignee_developer_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'TODO',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_milestone ON project_tasks(milestone_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_assignee ON project_tasks(assignee_developer_id);

CREATE TABLE IF NOT EXISTS project_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    milestone_id UUID REFERENCES project_milestones(id) ON DELETE SET NULL,
    file_name VARCHAR(255) NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    uploaded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(project_id);
CREATE INDEX IF NOT EXISTS idx_project_files_milestone ON project_files(milestone_id);
CREATE INDEX IF NOT EXISTS idx_project_files_uploader ON project_files(uploaded_by_user_id);

