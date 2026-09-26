'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { Check, RefreshCw } from 'lucide-react';

interface ProjectRow {
  id: string;
  project_number: string;
  title: string;
  category: string;
  client_number: string;
  company_name: string;
  budget_min: number;
  budget_max: number;
  status: string;
  claims_count: number;
  max_claims: number;
}

export default function AdminProjectsPage() {
  const { addToast } = useToast();
  const [projects, setProjects] = React.useState<ProjectRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [approvingId, setApprovingId] = React.useState<string | null>(null);

  const fetchProjects = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<{ projects: ProjectRow[] }>('/admin/projects');
      setProjects(res.projects || []);
    } catch (_err) {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleApproveProject = async (id: string, title: string) => {
    setApprovingId(id);
    try {
      await apiClient.post(`/projects/${id}/approve`, { maxClaims: 5, deadlineDays: 7 });
      addToast(
        'success',
        'Project Approved for Claims',
        `"${title}" is now OPEN_FOR_CLAIMS in the developer marketplace.`
      );
      await fetchProjects();
    } catch (err: any) {
      addToast('error', 'Approval Failed', err.message || 'Unable to approve project.');
    } finally {
      setApprovingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Project Governance & Lifecycle</h1>
          <p className="text-xs text-muted mt-1">
            Review client submissions, configure claim limits, set deadlines, and manage transitions.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={fetchProjects}
          leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
        >
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Projects</CardTitle>
          <CardDescription>
            Admin maintains real client identity privately while exposing only anonymous tags in marketplace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="p-8 text-center text-xs text-muted">Loading projects...</div>
          ) : projects.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted">No projects found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number & Title</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Budget Range</TableHead>
                  <TableHead>Claims Progress</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((proj) => (
                  <TableRow key={proj.id}>
                    <TableCell>
                      <span className="font-mono text-[10px] text-muted block">{proj.project_number}</span>
                      <span className="text-xs font-semibold text-foreground">{proj.title}</span>
                      <span className="text-[10px] text-muted block">{proj.category}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-accent block">{proj.client_number}</span>
                      <span className="text-[10px] text-muted">{proj.company_name}</span>
                    </TableCell>
                    <TableCell className="text-xs text-foreground font-mono">
                      ₹{Number(proj.budget_min).toLocaleString()} – ₹{Number(proj.budget_max).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted">
                      {proj.claims_count || 0} / {proj.max_claims || 5}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          proj.status === 'PUBLISHED'
                            ? 'success'
                            : proj.status === 'OPEN_FOR_CLAIMS'
                            ? 'default'
                            : 'warning'
                        }
                        size="sm"
                      >
                        {proj.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {proj.status === 'SUBMITTED' && (
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          isLoading={approvingId === proj.id}
                          onClick={() => handleApproveProject(proj.id, proj.title)}
                          leftIcon={<Check className="h-3 w-3" />}
                        >
                          Approve into Marketplace
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
