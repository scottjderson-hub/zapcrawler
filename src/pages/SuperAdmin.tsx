import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, Users, ShieldCheck, Coins, Activity, Plus, Minus, Search } from 'lucide-react';
import { API_BASE_URL, getAuthHeaders } from '@/lib/api';
import axios from 'axios';

interface User {
  user_id: string;
  email: string;
  balance: number;
  total_purchased: number;
  total_consumed: number;
  is_super_admin: boolean;
  created_at: string;
  last_login: string;
}

interface Statistics {
  total_users: number;
  users_with_tokens: number;
  total_tokens_distributed: number;
  total_tokens_consumed: number;
  total_tokens_remaining: number;
  super_admins: number;
}

interface AuditLog {
  id: string;
  admin_email: string;
  action_type: string;
  target_email: string;
  details: any;
  created_at: string;
}

export default function SuperAdmin() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  const [creditAction, setCreditAction] = useState<'add' | 'deduct'>('add');
  const [creditAmount, setCreditAmount] = useState('');
  const [creditReason, setCreditReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!session) {
      navigate('/login');
      return;
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => {
    // Filter users based on search query
    if (searchQuery.trim() === '') {
      setFilteredUsers(users);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredUsers(
        users.filter(
          (user) =>
            user.email.toLowerCase().includes(query) ||
            user.user_id.toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, users]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const headers = await getAuthHeaders();

      const [usersRes, statsRes, logsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/admin/users`, { headers }),
        axios.get(`${API_BASE_URL}/admin/statistics`, { headers }),
        axios.get(`${API_BASE_URL}/admin/audit-logs?limit=50`, { headers }),
      ]);

      if (usersRes.data.success) {
        setUsers(usersRes.data.users);
        setFilteredUsers(usersRes.data.users);
      }

      if (statsRes.data.success) {
        setStatistics(statsRes.data.statistics);
      }

      if (logsRes.data.success) {
        setAuditLogs(logsRes.data.logs);
      }
    } catch (error: any) {
      console.error('Error fetching admin data:', error);
      if (error.response?.status === 403) {
        toast.error('Access denied. Super admin privileges required.');
        // Don't navigate immediately - let user see the error
        setLoading(false);
      } else if (error.response?.status === 401) {
        toast.error('Session expired. Please log in again.');
        navigate('/login');
      } else {
        toast.error('Failed to load admin data');
        setLoading(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const openCreditDialog = (user: User, action: 'add' | 'deduct') => {
    setSelectedUser(user);
    setCreditAction(action);
    setCreditAmount('');
    setCreditReason('');
    setCreditDialogOpen(true);
  };

  const handleCreditSubmit = async () => {
    if (!selectedUser || !creditAmount) {
      toast.error('Please enter a valid amount');
      return;
    }

    const amount = parseInt(creditAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a positive number');
      return;
    }

    if (creditAction === 'deduct' && amount > selectedUser.balance) {
      toast.error('Insufficient balance');
      return;
    }

    try {
      setSubmitting(true);
      const headers = await getAuthHeaders();
      const endpoint =
        creditAction === 'add' ? `${API_BASE_URL}/admin/credits/add` : `${API_BASE_URL}/admin/credits/deduct`;

      const response = await axios.post(endpoint, {
        userId: selectedUser.user_id,
        cubes: amount,
        reason: creditReason || `Admin ${creditAction} credits`,
      }, { headers });

      if (response.data.success) {
        toast.success(
          `Successfully ${creditAction === 'add' ? 'added' : 'deducted'} ${amount} credits ${
            creditAction === 'add' ? 'to' : 'from'
          } ${selectedUser.email}`
        );
        setCreditDialogOpen(false);
        fetchData(); // Refresh data
      } else {
        toast.error(response.data.message || 'Failed to update credits');
      }
    } catch (error: any) {
      console.error('Error updating credits:', error);
      toast.error(error.response?.data?.message || 'Failed to update credits');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-8 w-8" />
            Super Admin Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">Manage users, credits, and system settings</p>
        </div>
        <Button variant="outline" onClick={() => navigate('/dashboard')}>
          Back to Dashboard
        </Button>
      </div>

      {/* Statistics Cards */}
      {statistics && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(statistics.total_users)}</div>
              <p className="text-xs text-muted-foreground">
                {formatNumber(statistics.users_with_tokens)} with tokens
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tokens Distributed</CardTitle>
              <Coins className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatNumber(statistics.total_tokens_distributed)}
              </div>
              <p className="text-xs text-muted-foreground">Total purchased</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tokens Consumed</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatNumber(statistics.total_tokens_consumed)}
              </div>
              <p className="text-xs text-muted-foreground">
                {formatNumber(statistics.total_tokens_remaining)} remaining
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Super Admins</CardTitle>
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(statistics.super_admins)}</div>
              <p className="text-xs text-muted-foreground">Active administrators</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs for Users and Audit Logs */}
      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Management</CardTitle>
              <CardDescription>View and manage user accounts and credits</CardDescription>
              <div className="flex items-center space-x-2 mt-4">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by email or user ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="max-w-sm"
                />
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Purchased</TableHead>
                    <TableHead>Consumed</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        No users found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((user) => (
                      <TableRow key={user.user_id}>
                        <TableCell className="font-medium">
                          {user.email}
                          {user.is_super_admin && (
                            <Badge variant="secondary" className="ml-2">
                              Admin
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{formatNumber(user.balance)}</TableCell>
                        <TableCell>{formatNumber(user.total_purchased)}</TableCell>
                        <TableCell>{formatNumber(user.total_consumed)}</TableCell>
                        <TableCell>
                          {user.balance > 0 ? (
                            <Badge variant="default">Active</Badge>
                          ) : (
                            <Badge variant="outline">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(user.created_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openCreditDialog(user, 'add')}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openCreditDialog(user, 'deduct')}
                              disabled={user.balance === 0}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Audit Logs</CardTitle>
              <CardDescription>View all administrative actions</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Target User</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No audit logs found
                      </TableCell>
                    </TableRow>
                  ) : (
                    auditLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm">{formatDate(log.created_at)}</TableCell>
                        <TableCell className="font-medium">{log.admin_email}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              log.action_type === 'ADD_CREDITS' ? 'default' : 'destructive'
                            }
                          >
                            {log.action_type}
                          </Badge>
                        </TableCell>
                        <TableCell>{log.target_email}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {log.details?.cubes_added && `+${log.details.cubes_added} cubes`}
                          {log.details?.cubes_deducted && `-${log.details.cubes_deducted} cubes`}
                          {log.details?.reason && ` - ${log.details.reason}`}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Credit Dialog */}
      <Dialog open={creditDialogOpen} onOpenChange={setCreditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {creditAction === 'add' ? 'Add Credits' : 'Deduct Credits'}
            </DialogTitle>
            <DialogDescription>
              {creditAction === 'add' ? 'Add credits to' : 'Deduct credits from'}{' '}
              {selectedUser?.email}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (Cubes)</Label>
              <Input
                id="amount"
                type="number"
                placeholder="Enter amount"
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                min="1"
              />
              {selectedUser && (
                <p className="text-sm text-muted-foreground">
                  Current balance: {formatNumber(selectedUser.balance)} cubes
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason (optional)</Label>
              <Input
                id="reason"
                placeholder="Enter reason for adjustment"
                value={creditReason}
                onChange={(e) => setCreditReason(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreditSubmit}
              disabled={submitting || !creditAmount}
              variant={creditAction === 'add' ? 'default' : 'destructive'}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  {creditAction === 'add' ? (
                    <Plus className="mr-2 h-4 w-4" />
                  ) : (
                    <Minus className="mr-2 h-4 w-4" />
                  )}
                  {creditAction === 'add' ? 'Add Credits' : 'Deduct Credits'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
