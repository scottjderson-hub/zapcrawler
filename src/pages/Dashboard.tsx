import { Activity, Database, Globe, Mail, PlayCircle, Users, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getEmailAccounts, getProxies, getSyncJobs } from '@/lib/api';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function Dashboard() {
  const queryClient = useQueryClient();
  
  // Fetch real data
  const { data: emailAccounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: ['emailAccounts'],
    queryFn: getEmailAccounts,
  });

  const { data: proxies = [], isLoading: loadingProxies } = useQuery({
    queryKey: ['proxies'],
    queryFn: getProxies,
  });

  const { data: syncJobs = [], isLoading: loadingJobs } = useQuery({
    queryKey: ['syncJobs'],
    queryFn: getSyncJobs,
    // Removed polling to prevent rate limiting on Railway
  });

  // Lightweight realtime listener for email count updates only
  useEffect(() => {
    console.log('📊 Dashboard: Setting up Supabase realtime listener...');
    
    const channel = supabase
      .channel('dashboard-email-count-updates')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events first to debug
          schema: 'public',
          table: 'sync_jobs'
        },
        (payload) => {
          console.log('📊 Dashboard: Realtime sync_jobs change:', payload);
          
          // Only update email counts for UPDATE events with current_count changes
          if (payload.eventType === 'UPDATE' && payload.new && payload.new.id && payload.new.current_count !== payload.old?.current_count) {
            console.log('📊 Dashboard: Updating email count for job:', payload.new.id, 'new count:', payload.new.current_count);
            
            queryClient.setQueryData(['syncJobs'], (oldData: any[]) => {
              if (!Array.isArray(oldData)) {
                console.log('❌ Dashboard: Invalid oldData, not an array:', oldData);
                return oldData;
              }
              
              const updated = oldData.map(job => 
                job.id === payload.new.id 
                  ? { ...job, current_count: payload.new.current_count }
                  : job
              );
              
              console.log('✅ Dashboard: Updated jobs data with new email count');
              return updated;
            });
          }
        }
      )
      .subscribe((status) => {
        console.log('🔌 Dashboard: Email count realtime subscription status:', status);
      });

    return () => {
      console.log('🧹 Dashboard: Cleaning up Supabase realtime listener');
      supabase.removeChannel(channel);
    };
  }, []); // Remove queryClient dependency to prevent re-renders

  // Calculate stats from real data
  const runningJobs = syncJobs.filter((job: any) => job.status === 'running');
  const totalEmailsCrawled = syncJobs
    .filter((job: any) => job.status === 'completed')
    .reduce((total: number, job: any) => total + (job.current_count || 0), 0);

  const stats = [
    {
      title: "Total Email Accounts",
      value: loadingAccounts ? "-" : emailAccounts.length.toString(),
      icon: Mail,
      color: "text-blue-600",
      isLoading: loadingAccounts
    },
    {
      title: "Active Proxies",
      value: loadingProxies ? "-" : proxies.length.toString(),
      icon: Globe,
      color: "text-green-600",
      isLoading: loadingProxies
    },
    {
      title: "Running Jobs",
      value: loadingJobs ? "-" : runningJobs.length.toString(),
      icon: Activity,
      color: "text-orange-600",
      isLoading: loadingJobs
    },
    {
      title: "Emails Crawled",
      value: loadingJobs ? "-" : totalEmailsCrawled.toLocaleString(),
      icon: Database,
      color: "text-purple-600",
      isLoading: loadingJobs
    }
  ];

  // Get the most recent jobs (last 5)
  const recentJobs = syncJobs
    .slice()
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
    .map((job: any) => ({
      id: job.id || job._id,
      name: job.name || `Crawl Job ${new Date(job.created_at).toLocaleDateString()}`,
      status: job.status,
      progress: job.status === 'running' ? Math.floor(Math.random() * 80) + 10 : job.status === 'completed' ? 100 : 0,
      emails: job.current_count || 0,
      timeLeft: job.status === 'completed' ? 'Completed' : 
               job.status === 'running' ? 'Running...' :
               job.status === 'failed' ? 'Failed' : 'Queued'
    }));

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running": return "bg-orange-500";
      case "completed": return "bg-green-500";
      case "failed": return "bg-red-500";
      case "pending": return "bg-gray-500";
      default: return "bg-gray-500";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "running": return "Running";
      case "completed": return "Completed";
      case "failed": return "Failed";
      case "pending": return "Pending";
      default: return "Unknown";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Monitor your email crawling operations</p>
        </div>
        <Button className="bg-gradient-primary hover:opacity-90 shadow-glow">
          <PlayCircle className="mr-2 h-4 w-4" />
          New Crawl Job
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <Card key={index} className="border-border hover:shadow-elegant transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground flex items-center gap-2">
                {stat.isLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <span className="text-muted-foreground">Loading...</span>
                  </>
                ) : (
                  stat.value
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Jobs */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Recent Jobs
            </CardTitle>
            <CardDescription>
              Track your latest email crawling operations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingJobs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Loading recent jobs...</span>
              </div>
            ) : recentJobs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No jobs found</p>
                <p className="text-sm">Create your first crawl job to get started</p>
              </div>
            ) : (
              recentJobs.map((job) => (
              <div key={job.id} className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent/50 transition-colors">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-foreground">{job.name}</h4>
                    <Badge variant="secondary" className={`${getStatusColor(job.status)} text-white`}>
                      {getStatusText(job.status)}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {job.emails} emails • {job.timeLeft}
                  </p>
                  {job.status === "running" && (
                    <Progress value={job.progress} className="w-full h-2" />
                  )}
                </div>
              </div>
            )))}
          </CardContent>
        </Card>

        {/* System Status */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              System Status
            </CardTitle>
            <CardDescription>
              Monitor system health and resources
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">CPU Usage</span>
                <span className="text-sm font-medium">45%</span>
              </div>
              <Progress value={45} className="h-2" />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Memory</span>
                <span className="text-sm font-medium">2.1GB / 8GB</span>
              </div>
              <Progress value={26} className="h-2" />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Storage</span>
                <span className="text-sm font-medium">156GB / 500GB</span>
              </div>
              <Progress value={31} className="h-2" />
            </div>

            <div className="pt-4 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">System Status</span>
                <Badge className="bg-success text-success-foreground">Healthy</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}