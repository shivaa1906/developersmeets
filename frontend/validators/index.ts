import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const developerRegisterSchema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username cannot exceed 30 characters')
    .regex(/^[a-z0-9_-]+$/, 'Username can only contain lowercase letters, numbers, hyphens, and underscores'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  location: z.string().optional(),
  roleTitle: z.string().min(2, 'Professional role title is required'),
  experience: z.coerce.number().min(0, 'Experience in years must be >= 0'),
  skills: z.array(z.string()).min(1, 'At least one skill is required'),
  githubUrl: z.string().url('Must be a valid GitHub URL').optional().or(z.literal('')),
  linkedinUrl: z.string().url('Must be a valid LinkedIn URL').optional().or(z.literal('')),
  portfolioUrl: z.string().url('Must be a valid Portfolio URL').optional().or(z.literal('')),
  bio: z.string().max(1000, 'Bio must be under 1000 characters').optional(),
});

export const clientProjectSubmissionSchema = z.object({
  title: z.string().min(5, 'Project title must be at least 5 characters'),
  category: z.string().min(2, 'Category is required'),
  description: z.string().min(30, 'Please provide a detailed project description (min 30 characters)'),
  businessRequirements: z.string().min(20, 'Business requirements are required'),
  budgetMin: z.coerce.number().positive('Minimum budget must be positive'),
  budgetMax: z.coerce.number().positive('Maximum budget must be positive'),
  expectedTimeline: z.string().min(2, 'Timeline is required (e.g. 30 days)'),
  requiredTechnologies: z.array(z.string()).min(1, 'Specify at least one required technology'),
  referenceUrls: z.array(z.string().url()).optional(),
});

export const proposalSubmissionSchema = z.object({
  approach: z.string().min(50, 'Please detail your architectural and technical approach'),
  timeline: z.string().min(3, 'Estimated delivery timeline is required'),
  price: z.coerce.number().positive('Proposal price must be greater than zero'),
  milestones: z.array(z.string()).min(1, 'Define at least one milestone'),
  technologies: z.array(z.string()).min(1, 'Select technologies to be used'),
  additionalNotes: z.string().optional(),
});

export const supportTicketSchema = z.object({
  projectId: z.string().uuid('Valid project ID required'),
  subject: z.string().min(5, 'Subject is required'),
  description: z.string().min(20, 'Please provide a detailed description of the issue'),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
});

export const creditPurchaseSchema = z.object({
  creditsAmount: z.coerce.number().min(1, 'Must purchase at least 1 credit'),
});
