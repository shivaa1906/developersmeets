export type UserRole = 'CEO' | 'ADMIN' | 'MD' | 'DEVELOPER' | 'CLIENT' | 'SUPPORT' | 'GUEST';

export type UserStatus = 'ACTIVE' | 'PENDING_VERIFICATION' | 'SUSPENDED' | 'DISABLED';

export interface User {
  id: string;
  public_uid?: string;
  email: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  email_verified?: boolean;
  is_suspended?: boolean;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}

export type DeveloperVerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';
export type DeveloperAvailability = 'AVAILABLE' | 'BUSY' | 'ON_PROJECT' | 'UNAVAILABLE';

export interface Developer {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  bio?: string;
  profile_image?: string;
  location?: string;
  role_title: string;
  experience: number;
  availability: DeveloperAvailability;
  verification_status: DeveloperVerificationStatus;
  verified_at?: string;
  skills: string[];
  github_url?: string;
  linkedin_url?: string;
  portfolio_url?: string;
  leetcode_url?: string;
  kaggle_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  user_id: string;
  client_number: string; // e.g. "Client #001"
  company_name: string;
  private_name: string;
  phone?: string;
  internal_notes?: string;
  created_at: string;
}

export type ProjectStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'REVIEWING'
  | 'OPEN_FOR_CLAIMS'
  | 'CLAIMS_ACTIVE'
  | 'SELECTION_PENDING'
  | 'DEVELOPER_SELECTED'
  | 'IN_PROGRESS'
  | 'SUBMITTED_FOR_REVIEW'
  | 'COMPLETED'
  | 'PUBLISHED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'DISPUTED'
  | 'ON_HOLD';

export interface Project {
  id: string;
  project_number: string; // e.g. "PRJ-2026-0001"
  slug: string;
  title: string;
  description: string;
  category: string;
  budget_min: number;
  budget_max: number;
  timeline: string;
  requirements: string[];
  required_technologies: string[];
  status: ProjectStatus;
  claim_cost: number;
  max_claims: number;
  current_claims?: number;
  claim_deadline: string;
  selection_deadline?: string;
  client_id?: string;
  lead_developer_id?: string;
  lead_developer?: Developer;
  contributors?: Developer[];
  created_at: string;
  updated_at: string;
}

export type ClaimStatus = 'CLAIMED' | 'SELECTED' | 'NOT_SELECTED' | 'WITHDRAWN' | 'DISQUALIFIED';

export interface ProjectClaim {
  id: string;
  project_id: string;
  developer_id: string;
  credit_transaction_id: string;
  status: ClaimStatus;
  claimed_at: string;
  selected_at?: string;
  rejected_at?: string;
  refund_transaction_id?: string;
  anonymous_developer_tag?: string; // e.g. "Developer #01"
}

export interface Proposal {
  id: string;
  project_claim_id: string;
  approach: string;
  timeline: string;
  price: number;
  milestones: string[];
  technologies: string[];
  additional_notes?: string;
  status: 'SUBMITTED' | 'ACCEPTED' | 'REJECTED';
  created_at: string;
  updated_at: string;
}

export interface CreditAccount {
  id: string;
  developer_id: string;
  balance: number;
  created_at: string;
  updated_at: string;
}

export type CreditTransactionType =
  | 'PURCHASE'
  | 'PROJECT_CLAIM'
  | 'PROJECT_NOT_SELECTED_REFUND'
  | 'PROJECT_CANCEL_REFUND'
  | 'WITHDRAWAL_REFUND'
  | 'ADMIN_ADJUSTMENT'
  | 'EXPIRATION_REFUND';

export interface CreditTransaction {
  id: string;
  developer_id: string;
  project_id?: string;
  type: CreditTransactionType;
  amount: number;
  balance_after: number;
  reference_id?: string;
  description: string;
  created_at: string;
}

export interface Milestone {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'SUBMITTED' | 'APPROVED' | 'CHANGES_REQUESTED' | 'COMPLETED';
  due_date?: string;
  completed_at?: string;
  order_index: number;
}

export interface ProjectTask {
  id: string;
  project_id: string;
  milestone_id?: string;
  title: string;
  description?: string;
  assignee_developer_id?: string;
  assignee_name?: string;
  status: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';
  created_at: string;
  updated_at: string;
}

export interface ProjectFile {
  id: string;
  project_id: string;
  milestone_id?: string;
  file_name: string;
  file_url: string;
  file_size: number;
  mime_type: string;
  uploaded_by_user_id: string;
  uploader_email?: string;
  created_at: string;
}

export interface ProjectWorkspace {
  overview: {
    id: string;
    projectNumber: string;
    title: string;
    description: string;
    status: ProjectStatus;
    category: string;
    timeline: string;
    budgetMin: number;
    budgetMax: number;
    clientNumber: string;
    companyName: string;
    leadDeveloper?: {
      id: string;
      username: string;
      name: string;
      title: string;
      avatar?: string;
    } | null;
    teamMembers: any[];
  };
  requirements: string[];
  requiredTechnologies: string[];
  milestones: Milestone[];
  tasks: ProjectTask[];
  files: ProjectFile[];
  messages: any[];
  timeline: Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    timestamp: string;
    status?: string;
  }>;
  payments: any[];
  support: SupportTicket[];
}

export interface SupportTicket {
  id: string;
  ticket_number: string; // e.g. "SUP-2026-0001"
  project_id: string;
  client_id: string;
  developer_id?: string;
  subject: string;
  description: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'ASSIGNED' | 'INVESTIGATING' | 'WAITING_FOR_CLIENT' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  created_at: string;
  updated_at: string;
  closed_at?: string;
}

