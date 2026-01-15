import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getEmailAccounts, listFolders, startSync, getSyncJobs, getSyncJobsDirect, getJobResults } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { 
  Play, 
  Pause, 
  Square, 
  Plus, 
  Edit, 
  Trash2, 
  Download,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  MoreHorizontal,
  RefreshCw,
  FileText,
  Loader2,
  Eye
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

const CrawlJobs = () => {
  const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);
  const [selectedJobResults, setSelectedJobResults] = useState<{ status: string; results: any[] } | null>(null);
  const [selectedJobName, setSelectedJobName] = useState("");
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [jobName, setJobName] = useState("");

  const { data: accounts = [], isLoading: isLoadingAccounts } = useQuery({
    queryKey: ['emailAccounts'],
    queryFn: getEmailAccounts,
  });

  const createJobMutation = useMutation({
    mutationFn: async ({ accountId, name }: { accountId: string, name: string }) => {
      const account: any = accounts.find((acc: any) => (acc.id || acc._id) === accountId); // Support both Supabase (id) and MongoDB (_id) formats
      if (!account) throw new Error("Account not found.");

      let foldersToSync: string[] = [];

      // POP3 accounts don't have folders, so we sync directly.
      // For IMAP-based providers (gmail, outlook, yahoo, imap, exchange, comcast), we use the stored folders.
      const imapProviders = ['gmail', 'outlook', 'yahoo', 'imap', 'exchange', 'comcast'];
      if (imapProviders.includes(account.provider?.toLowerCase())) {
        // Use the folders already stored in the account from when it was connected
        if (account.folders && account.folders.length > 0) {
          foldersToSync = account.folders.map((f: any) => f.path);
        } else {
          throw new Error("No folders found for this account. Please reconnect the account.");
        }
      }

      const syncResult = await startSync(accountId, foldersToSync, name);
      return { ...syncResult, jobName: name };
    },
    onSuccess: (data) => {
      toast.success(`Job "${data.jobName}" created and started successfully!`);
      queryClient.invalidateQueries({ queryKey: ['syncJobs'] });
      setIsCreateDialogOpen(false);
      setJobName("");
      setSelectedAccountId(null);
    },
    onError: (error: Error) => {
      toast.error(`Failed to create job: ${error.message}`);
    },
  });

  const handleCreateJob = () => {
    if (selectedAccountId && jobName) {
      createJobMutation.mutate({ accountId: selectedAccountId, name: jobName });
    }
  };

  // Pure Realtime approach - direct Supabase query with realtime updates
  const { data: jobs = [], isLoading: isLoadingJobs, isError } = useQuery({
    queryKey: ['syncJobs'],
    queryFn: getSyncJobsDirect, // Direct Supabase query instead of API
    refetchInterval: false, // NO POLLING - rely purely on realtime
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  // Listen to realtime changes and invalidate React Query cache
  useEffect(() => {
    const channel = supabase
      .channel('sync_jobs_changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'sync_jobs',
        },
        (payload) => {
          console.log('Sync jobs realtime change:', payload);
          // Invalidate and refetch the jobs query when data changes
          queryClient.invalidateQueries({ queryKey: ['syncJobs'] });
        }
      )
      .subscribe();

    return () => {
      console.log('Unsubscribing from sync_jobs_changes channel');
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Debug logging to see what's happening with jobs query
  console.log('CrawlJobs - Query state:', { 
    jobs, 
    jobsLength: jobs?.length, 
    isLoadingJobs, 
    isError,
    jobsType: typeof jobs,
    jobsIsArray: Array.isArray(jobs)
  });

  const fetchResultsMutation = useMutation({
    mutationFn: getJobResults,
    onSuccess: (data) => {
      setSelectedJobResults(data);
      setIsResultsModalOpen(true);
    },
    onError: (error: Error) => {
      toast.error(`Failed to fetch results: ${error.message}`);
    },
  });

  const handleViewResults = (job: any) => {
    setSelectedJobName(job.name);
    fetchResultsMutation.mutate(job.id || job._id); // Support both Supabase (id) and MongoDB (_id) formats
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "running":
        return <Badge variant="default" className="bg-blue-500"><Play className="w-3 h-3 mr-1" />Running</Badge>;
      case "completed":
        return <Badge variant="secondary" className="bg-green-500 text-white"><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      case "scheduled":
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Scheduled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const runningJobs = jobs.filter(job => job.status === "running").length;
  const completedJobs = jobs.filter(job => job.status === "completed").length;
  const failedJobs = jobs.filter(job => job.status === "failed").length;
  const scheduledJobs = jobs.filter(job => job.status === "scheduled").length;

  return (
    <div className="flex-1 space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Crawl Jobs</h2>
          <p className="text-muted-foreground">
            Manage and monitor your email crawling operations
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Create Job
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Create New Crawl Job</DialogTitle>
              <DialogDescription>
                Select an email account and name your job to start crawling all folders.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="job-name" className="text-right">
                  Job Name
                </Label>
                <Input
                  id="job-name"
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                  className="col-span-3"
                  placeholder="e.g., Weekly Marketing Scan"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="email-account" className="text-right">
                  Account
                </Label>
                <Select onValueChange={setSelectedAccountId} value={selectedAccountId || ''}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder={isLoadingAccounts ? "Loading..." : "Select an email account"} />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account: any) => (
                      <SelectItem key={account.id || account._id} value={account.id || account._id}>
                        {account.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleCreateJob}
                disabled={!selectedAccountId || !jobName || createJobMutation.isPending}
              >
                {createJobMutation.isPending ? "Creating..." : "Create and Start Job"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Running Jobs</CardTitle>
            <Play className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{runningJobs}</div>
            <p className="text-xs text-muted-foreground">
              Currently processing
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedJobs}</div>
            <p className="text-xs text-muted-foreground">
              Successfully finished
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{failedJobs}</div>
            <p className="text-xs text-muted-foreground">
              Encountered errors
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{scheduledJobs}</div>
            <p className="text-xs text-muted-foreground">
              Waiting to run
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Jobs Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Jobs</CardTitle>
          <CardDescription>
            Monitor and manage all your crawl jobs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job Name</TableHead>
                <TableHead>Email Account</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Extracted</TableHead>
                <TableHead>Start Time</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingJobs && (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <RefreshCw className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                    <p className="text-muted-foreground">Loading Jobs...</p>
                  </TableCell>
                </TableRow>
              )}
              {isError && (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-red-500">
                    Failed to load jobs. Please try again later.
                  </TableCell>
                </TableRow>
              )}
              {!isLoadingJobs && !isError && jobs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <h3 className="text-lg font-semibold">No jobs created yet.</h3>
                    <p className="text-sm text-muted-foreground">Click "Create Job" to start your first email crawl.</p>
                  </TableCell>
                </TableRow>
              )}
              {!isLoadingJobs && !isError && jobs.map((job: any) => {
                // Find the account for this job
                const jobAccount = accounts.find((acc: any) => 
                  (acc.id || acc._id) === job.account_id
                );
                
                return (
                <TableRow key={job.id || job._id}>
                  <TableCell className="font-medium">{job.name} [FIXED]</TableCell>
                  <TableCell>
                    {jobAccount?.email || (isLoadingAccounts ? 'Loading...' : 'Account not found')}
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={job.status === 'completed' ? 'default' : job.status === 'running' ? 'secondary' : 'destructive'}
                      className={`${job.status === 'completed' ? 'bg-green-500' : ''} ${job.status === 'running' ? 'animate-pulse' : ''}`}
                    >
                      {job.status === 'running' && <RefreshCw className="mr-2 h-3 w-3 animate-spin" />} 
                      {job.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {job.status === 'completed' ? `${job.progress || 100}%` : 
                     job.status === 'running' ? `${job.current_count || 0} messages` : 
                     job.status === 'failed' ? 'Failed' : 'Pending'}
                  </TableCell>
                  <TableCell>
                    {job.status === 'completed' ? `${job.result_count || 0} emails` : 
                     job.status === 'running' ? `${job.current_count || 0} processed` : 
                     job.status === 'failed' ? 'Failed' :
                     'N/A'}
                  </TableCell>
                  <TableCell>
                    {job.created_at ? new Date(job.created_at).toLocaleString() : 'Invalid Date'}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem 
                          onClick={() => handleViewResults(job)}
                          disabled={job.status !== 'completed' || fetchResultsMutation.isPending}
                        >
                          {fetchResultsMutation.isPending && fetchResultsMutation.variables === (job.id || job._id) ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Eye className="mr-2 h-4 w-4" />
                          )}
                          View Results
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled>
                          <Download className="mr-2 h-4 w-4" />
                          Download Results
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600" disabled>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Job
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Results Modal */}
      <Dialog open={isResultsModalOpen} onOpenChange={setIsResultsModalOpen}>
        <DialogContent className="max-w-4xl h-[80vh]">
          <DialogHeader>
            <DialogTitle>Results for: {selectedJobName}</DialogTitle>
            <DialogDescription>
              Found {selectedJobResults?.results?.length || 0} unique emails.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-grow overflow-y-auto p-4">
            {selectedJobResults?.results?.length ? (
              <div className="space-y-4">
                <div className="bg-muted p-4 rounded-lg">
                  <h4 className="font-medium mb-2">Unique Email Addresses:</h4>
                  <div className="text-sm font-mono bg-background p-3 rounded border max-h-96 overflow-y-auto">
                    {selectedJobResults.results.join(',')}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(selectedJobResults.results.join(','));
                      toast.success('Email addresses copied to clipboard!');
                    }}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Copy to Clipboard
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      const blob = new Blob([selectedJobResults.results.join(',')], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${selectedJobName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_emails.txt`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                      toast.success('Email addresses downloaded!');
                    }}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download as TXT
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                No email addresses found.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CrawlJobs;