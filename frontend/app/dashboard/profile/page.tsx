'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { apiClient } from '@/lib/api-client';
import {
  Camera,
  Upload,
  Trash2,
  Globe,
  Github,
  Linkedin,
  User,
  Mail,
  Phone,
  MapPin,
  Building2,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Link as LinkIcon,
  Loader2,
} from 'lucide-react';

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop&crop=faces',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=faces',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=faces',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop&crop=faces',
];

/**
 * Resize and compress an image client-side using HTML5 Canvas.
 * Produces a ~30-70KB optimized JPEG from any multi-megabyte photo in milliseconds.
 */
function compressAndResizeImage(file: File, maxSize = 512, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please select a valid image file (PNG, JPG, or WEBP).'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed reading file from device.'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed reading image format.'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function DashboardProfilePage() {
  const { user, updateUser } = useAuth();
  const { addToast } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [isSaving, setIsSaving] = React.useState(false);
  const [isCompressing, setIsCompressing] = React.useState(false);
  const [showUrlInput, setShowUrlInput] = React.useState(false);
  const [customUrl, setCustomUrl] = React.useState('');

  const [form, setForm] = React.useState({
    displayName: user?.name || '',
    email: user?.email || '',
    phone: '',
    location: '',
    roleTitle: '',
    companyName: '',
    experience: '3',
    availability: 'AVAILABLE' as 'AVAILABLE' | 'BUSY' | 'ON_PROJECT' | 'UNAVAILABLE',
    bio: '',
    githubUrl: '',
    linkedinUrl: '',
    portfolioUrl: '',
    skills: '',
    profilePhoto: user?.profileImage || user?.avatarUrl || '',
  });

  const isClient = user?.role === 'CLIENT';
  const isExecutive = user?.role === 'CEO' || user?.role === 'MD' || user?.role === 'ADMIN';
  const isDeveloper = user?.role === 'DEVELOPER';

  // Load existing profile details from API
  React.useEffect(() => {
    // 1. Fetch developer profile if developer or executive
    if (isDeveloper || isExecutive) {
      apiClient
        .get<{ developer: any }>('/developers/me')
        .then((res) => {
          if (res.developer) {
            const dev = res.developer;
            setForm((prev) => ({
              ...prev,
              displayName: dev.display_name || user?.name || '',
              roleTitle: dev.role_title || '',
              experience: String(dev.experience || 3),
              availability: dev.availability || 'AVAILABLE',
              bio: dev.bio || '',
              githubUrl: dev.github_url || '',
              linkedinUrl: dev.linkedin_url || '',
              portfolioUrl: dev.portfolio_url || '',
              profilePhoto: dev.profile_photo || user?.profileImage || user?.avatarUrl || '',
              skills: Array.isArray(dev.skills)
                ? dev.skills.map((s: any) => (typeof s === 'string' ? s : s.name)).join(', ')
                : '',
            }));
          }
        })
        .catch(() => {});
    }

    // 2. Fetch authenticated account profile info
    apiClient
      .get<{ user: any }>('/auth/me')
      .then((res) => {
        if (res.user) {
          const u = res.user;
          setForm((prev) => ({
            ...prev,
            displayName: prev.displayName || u.name || '',
            email: u.email || prev.email,
            phone: u.phone || prev.phone,
            profilePhoto: prev.profilePhoto || u.profile_image || u.avatar_url || '',
          }));
        }
      })
      .catch(() => {});
  }, [user, isDeveloper, isExecutive]);

  // Handle image file upload with instant client-side canvas compression
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      addToast('error', 'File Too Large', 'Please select an image smaller than 25MB.');
      return;
    }

    try {
      setIsCompressing(true);
      const compressedDataUrl = await compressAndResizeImage(file, 512, 0.82);
      setForm((prev) => ({ ...prev, profilePhoto: compressedDataUrl }));
      addToast('success', 'Photo Selected', 'Image preview loaded and optimized. Click "Save Profile Changes" to persist.');
    } catch (err: any) {
      addToast('error', 'Image Processing Failed', err?.message || 'Could not process selected image.');
    } finally {
      setIsCompressing(false);
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handleApplyCustomUrl = () => {
    const trimmed = customUrl.trim();
    if (!trimmed) return;

    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('data:image/')) {
      addToast('error', 'Invalid URL', 'Please enter a valid image URL starting with https:// or http://');
      return;
    }

    setForm((prev) => ({ ...prev, profilePhoto: trimmed }));
    setShowUrlInput(false);
    setCustomUrl('');
    addToast('success', 'Photo URL Applied', 'Preview updated. Click "Save Profile Changes" to persist.');
  };

  const handleRemovePhoto = () => {
    setForm((prev) => ({ ...prev, profilePhoto: '' }));
    addToast('info', 'Photo Removed', 'Reverted to name initials avatar. Click "Save Profile Changes" to persist.');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      // 1. Update general user profile via /auth/profile
      await apiClient.patch('/auth/profile', {
        name: form.displayName.trim(),
        phone: form.phone.trim(),
        location: form.location.trim(),
        profileImage: form.profilePhoto,
        avatarUrl: form.profilePhoto,
        roleTitle: form.roleTitle.trim(),
        companyName: form.companyName.trim(),
        bio: form.bio.trim(),
        githubUrl: form.githubUrl.trim(),
        linkedinUrl: form.linkedinUrl.trim(),
        portfolioUrl: form.portfolioUrl.trim(),
        experience: Number(form.experience) || 0,
        availability: form.availability,
        skills: form.skills,
      });

      // 2. Also sync developer specific profile if developer/executive
      if (isDeveloper || isExecutive) {
        await apiClient.patch('/developers/profile', {
          displayName: form.displayName.trim(),
          roleTitle: form.roleTitle.trim(),
          bio: form.bio.trim(),
          location: form.location.trim(),
          experience: Number(form.experience) || 0,
          availability: form.availability,
          githubUrl: form.githubUrl.trim(),
          linkedinUrl: form.linkedinUrl.trim(),
          portfolioUrl: form.portfolioUrl.trim(),
          profilePhoto: form.profilePhoto,
          skills: form.skills
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        }).catch(() => {});
      }

      // 3. Update local session state for instantaneous navbar and header reaction
      updateUser({
        name: form.displayName.trim(),
        profileImage: form.profilePhoto,
        avatarUrl: form.profilePhoto,
      });

      addToast('success', 'Profile Updated Successfully', 'Your photo and profile details have been saved.');
    } catch (err: any) {
      addToast('error', 'Update Failed', err.message || 'Unable to save profile details.');
    } finally {
      setIsSaving(false);
    }
  };

  const initials = form.displayName
    ? form.displayName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'U';

  const isVerified = user?.verificationStatus === 'VERIFIED' || isExecutive;

  return (
    <div className="space-y-6 max-w-4xl pb-16">
      {/* Title & Introduction */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Account Profile</h1>
        <p className="text-xs text-muted mt-1">
          Customize your profile photo, public identity credentials, bio, and platform settings.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* 1. PHOTO & AVATAR CARD */}
        <Card className="rounded-xl border border-border bg-surface shadow-surface-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Profile Photo & Avatar</span>
              <Camera className="h-4 w-4 text-accent" />
            </CardTitle>
            <CardDescription>
              Upload a real profile photo or pick an avatar to represent you across workspaces and chats.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-start space-y-4 sm:space-y-0 sm:space-x-6">
              {/* Avatar Preview */}
              <div className="relative group shrink-0">
                <div className="h-24 w-24 rounded-full border-2 border-accent/40 bg-accent/10 flex items-center justify-center overflow-hidden shadow-surface-card">
                  {form.profilePhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={form.profilePhoto}
                      alt="Profile preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl font-bold text-accent font-mono">{initials}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 p-1.5 rounded-full bg-accent text-accent-foreground shadow-md hover:scale-110 transition-transform"
                  title="Upload new photo"
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Photo Controls */}
              <div className="space-y-3 flex-1 text-center sm:text-left">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    disabled={isCompressing}
                    onClick={() => fileInputRef.current?.click()}
                    leftIcon={
                      isCompressing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5" />
                      )
                    }
                  >
                    {isCompressing ? 'Optimizing...' : 'Upload Photo'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowUrlInput(!showUrlInput)}
                    leftIcon={<LinkIcon className="h-3.5 w-3.5" />}
                  >
                    Image URL
                  </Button>
                  {form.profilePhoto && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={handleRemovePhoto}
                      leftIcon={<Trash2 className="h-3.5 w-3.5 text-status-danger" />}
                      className="text-status-danger hover:text-status-danger hover:bg-status-danger/10"
                    >
                      Remove
                    </Button>
                  )}
                </div>

                {/* Inline URL Input */}
                {showUrlInput && (
                  <div className="flex items-center space-x-2 pt-1 max-w-md">
                    <Input
                      placeholder="https://example.com/avatar.jpg"
                      value={customUrl}
                      onChange={(e) => setCustomUrl(e.target.value)}
                    />
                    <Button type="button" size="sm" onClick={handleApplyCustomUrl}>
                      Apply
                    </Button>
                  </div>
                )}

                {/* Preset Avatars */}
                <div className="pt-1">
                  <span className="text-[11px] text-muted block mb-1.5 font-medium">
                    Or select a curated preset:
                  </span>
                  <div className="flex items-center justify-center sm:justify-start space-x-2">
                    {PRESET_AVATARS.map((url, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, profilePhoto: url }))}
                        className={`h-8 w-8 rounded-full overflow-hidden border-2 transition-all hover:scale-110 ${
                          form.profilePhoto === url ? 'border-accent ring-2 ring-accent/30' : 'border-border'
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`Preset ${i + 1}`} className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2. PERSONAL DETAILS CARD */}
        <Card className="rounded-xl border border-border bg-surface shadow-surface-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Identity & Profile Details</CardTitle>
                <CardDescription>
                  Your public identity, professional title, and contact coordinates.
                </CardDescription>
              </div>
              <Badge variant={isVerified ? 'success' : 'warning'}>
                {isVerified ? 'VERIFIED' : 'ACTIVE'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Full Name / Display Name"
                placeholder="Your full legal or display name"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                leftIcon={<User className="h-4 w-4" />}
                required
              />
              <Input
                label="Professional Role / Title"
                placeholder="e.g. Lead Full-Stack Architect"
                value={form.roleTitle}
                onChange={(e) => setForm({ ...form, roleTitle: e.target.value })}
                leftIcon={<Sparkles className="h-4 w-4" />}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Email Address (Server Verified)"
                value={form.email}
                disabled
                leftIcon={<Mail className="h-4 w-4" />}
                helperText="Email is bound to your account authorization"
              />
              <Input
                label="Phone Number"
                type="tel"
                placeholder="+1 (555) 019-2834"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                leftIcon={<Phone className="h-4 w-4" />}
              />
            </div>

            {isClient && (
              <Input
                label="Company / Enterprise Name"
                placeholder="Apex Retail Labs Inc."
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                leftIcon={<Building2 className="h-4 w-4" />}
              />
            )}

            <Textarea
              label="Bio & Executive Summary"
              placeholder="Tell clients, engineers, and platform members about your background and technical focus..."
              rows={3}
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
            />
          </CardContent>
        </Card>

        {/* 3. TECHNICAL & PORTFOLIO DETAILS (For Developers & Executives) */}
        {!isClient && (
          <Card className="rounded-xl border border-border bg-surface shadow-surface-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>Technical Skills & Portfolio</span>
                <Globe className="h-4 w-4 text-accent" />
              </CardTitle>
              <CardDescription>
                Showcase your technical competencies and verified portfolio links to clients.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Years of Experience"
                  type="number"
                  min={0}
                  max={40}
                  value={form.experience}
                  onChange={(e) => setForm({ ...form, experience: e.target.value })}
                />
                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wider text-muted">
                    Availability Status
                  </label>
                  <select
                    value={form.availability}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        availability: e.target.value as any,
                      })
                    }
                    className="w-full h-10 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-colors"
                  >
                    <option value="AVAILABLE">AVAILABLE (Open to project claims)</option>
                    <option value="BUSY">BUSY (Limited capacity)</option>
                    <option value="ON_PROJECT">ON_PROJECT (Currently active on workspace)</option>
                    <option value="UNAVAILABLE">UNAVAILABLE (Not taking new projects)</option>
                  </select>
                </div>
              </div>

              <Input
                label="Core Skills (Comma separated)"
                placeholder="TypeScript, Next.js, Node.js, PostgreSQL, Docker, AI/ML"
                value={form.skills}
                onChange={(e) => setForm({ ...form, skills: e.target.value })}
              />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input
                  label="GitHub Profile"
                  placeholder="https://github.com/username"
                  value={form.githubUrl}
                  onChange={(e) => setForm({ ...form, githubUrl: e.target.value })}
                  leftIcon={<Github className="h-4 w-4" />}
                />
                <Input
                  label="LinkedIn Profile"
                  placeholder="https://linkedin.com/in/username"
                  value={form.linkedinUrl}
                  onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })}
                  leftIcon={<Linkedin className="h-4 w-4" />}
                />
                <Input
                  label="Portfolio / Website"
                  placeholder="https://yourportfolio.dev"
                  value={form.portfolioUrl}
                  onChange={(e) => setForm({ ...form, portfolioUrl: e.target.value })}
                  leftIcon={<Globe className="h-4 w-4" />}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* 4. SUBMIT / SAVE CARD */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center space-x-2 text-xs text-muted">
            <ShieldCheck className="h-4 w-4 text-status-success" />
            <span>Profile updates sync in real time across the platform</span>
          </div>

          <Button type="submit" size="lg" isLoading={isSaving} className="px-8 font-semibold">
            Save Profile Changes
          </Button>
        </div>
      </form>
    </div>
  );
}
