import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Settings as SettingsIcon,
  Globe,
  Bell,
  Download,
  Shield,
  Activity,
  Mail,
  Clock,
  Database,
  AlertTriangle,
  Save,
  RotateCcw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Settings = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useState({
    general: {
      appName: "ZapCrawler",
      timezone: "UTC",
      language: "en",
      theme: "dark"
    },
    crawler: {
      maxConcurrentJobs: 3,
      emailsPerBatch: 100,
      requestDelay: 500,
      timeout: 30,
      retryAttempts: 3,
      maxFoldersPerAccount: 50
    },
    proxy: {
      enableRotation: true,
      rotationInterval: 100,
      healthCheckInterval: 5,
      failureThreshold: 3,
      autoRetry: true
    },
    notifications: {
      emailNotifications: true,
      jobCompletionAlert: true,
      errorAlert: true,
      dailyReport: false,
      webhookUrl: ""
    },
    export: {
      defaultFormat: "csv",
      includeHeaders: true,
      duplicateHandling: "skip",
      compression: false
    },
    security: {
      sessionTimeout: 60,
      twoFactorAuth: false,
      encryptData: true,
      auditLog: true
    }
  });

  const handleSave = () => {
    toast({
      title: "Settings saved",
      description: "Your configuration has been updated successfully.",
    });
  };

  const handleReset = () => {
    toast({
      title: "Settings reset",
      description: "All settings have been reset to default values.",
    });
  };

  return (
    <div className="flex-1 space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Settings</h2>
          <p className="text-muted-foreground">
            Configure your ZapCrawler application
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset to Defaults
          </Button>
          <Button onClick={handleSave} className="shadow-glow">
            <Save className="mr-2 h-4 w-4" />
            Save Changes
          </Button>
        </div>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="general" className="flex items-center gap-2">
            <SettingsIcon className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="crawler" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Crawler
          </TabsTrigger>
          <TabsTrigger value="proxy" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Proxy
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="export" className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Security
          </TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>General Configuration</CardTitle>
              <CardDescription>
                Basic application settings and preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="app-name">Application Name</Label>
                  <Input id="app-name" value={settings.general.appName} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select value={settings.general.timezone}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTC">UTC</SelectItem>
                      <SelectItem value="EST">Eastern Time</SelectItem>
                      <SelectItem value="PST">Pacific Time</SelectItem>
                      <SelectItem value="GMT">Greenwich Mean Time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="language">Language</Label>
                  <Select value={settings.general.language}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                      <SelectItem value="de">German</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="theme">Theme</Label>
                  <Select value={settings.general.theme}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="auto">Auto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Crawler Settings */}
        <TabsContent value="crawler" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Crawler Configuration</CardTitle>
              <CardDescription>
                Performance and behavior settings for email crawling
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Max Concurrent Jobs</Label>
                  <div className="space-y-2">
                    <Slider
                      value={[settings.crawler.maxConcurrentJobs]}
                      max={10}
                      min={1}
                      step={1}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>1</span>
                      <span>Current: {settings.crawler.maxConcurrentJobs}</span>
                      <span>10</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Emails per Batch</Label>
                  <div className="space-y-2">
                    <Slider
                      value={[settings.crawler.emailsPerBatch]}
                      max={500}
                      min={50}
                      step={50}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>50</span>
                      <span>Current: {settings.crawler.emailsPerBatch}</span>
                      <span>500</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Request Delay (ms)</Label>
                  <Input 
                    type="number" 
                    value={settings.crawler.requestDelay}
                    placeholder="500"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Timeout (seconds)</Label>
                  <Input 
                    type="number" 
                    value={settings.crawler.timeout}
                    placeholder="30"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Retry Attempts</Label>
                  <Input 
                    type="number" 
                    value={settings.crawler.retryAttempts}
                    placeholder="3"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Folders per Account</Label>
                  <Input 
                    type="number" 
                    value={settings.crawler.maxFoldersPerAccount}
                    placeholder="50"
                  />
                </div>
              </div>
              
              <Separator />
              
              <div className="space-y-4">
                <h4 className="text-sm font-medium">Rate Limiting</h4>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Smart Rate Limiting</Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically adjust crawling speed based on server response
                    </p>
                  </div>
                  <Switch />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Proxy Settings */}
        <TabsContent value="proxy" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Proxy Configuration</CardTitle>
              <CardDescription>
                Manage proxy rotation and health monitoring
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable Proxy Rotation</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically rotate proxies during crawling
                  </p>
                </div>
                <Switch checked={settings.proxy.enableRotation} />
              </div>
              
              <Separator />
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Rotation Interval (requests)</Label>
                  <Input 
                    type="number" 
                    value={settings.proxy.rotationInterval}
                    placeholder="100"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Health Check Interval (minutes)</Label>
                  <Input 
                    type="number" 
                    value={settings.proxy.healthCheckInterval}
                    placeholder="5"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Failure Threshold</Label>
                  <Input 
                    type="number" 
                    value={settings.proxy.failureThreshold}
                    placeholder="3"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Connection Timeout (seconds)</Label>
                  <Input 
                    type="number" 
                    placeholder="10"
                  />
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto-retry Failed Proxies</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically retry failed proxies after cooldown period
                  </p>
                </div>
                <Switch checked={settings.proxy.autoRetry} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Settings */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>
                Configure alerts and reporting options
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Email Notifications</Label>
                    <p className="text-xs text-muted-foreground">
                      Send notifications to your email address
                    </p>
                  </div>
                  <Switch checked={settings.notifications.emailNotifications} />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Job Completion Alerts</Label>
                    <p className="text-xs text-muted-foreground">
                      Notify when crawl jobs finish
                    </p>
                  </div>
                  <Switch checked={settings.notifications.jobCompletionAlert} />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Error Alerts</Label>
                    <p className="text-xs text-muted-foreground">
                      Immediate notifications for critical errors
                    </p>
                  </div>
                  <Switch checked={settings.notifications.errorAlert} />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Daily Reports</Label>
                    <p className="text-xs text-muted-foreground">
                      Daily summary of crawling activities
                    </p>
                  </div>
                  <Switch checked={settings.notifications.dailyReport} />
                </div>
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <Label>Webhook URL</Label>
                <Input 
                  placeholder="https://your-webhook-url.com/notify"
                  value={settings.notifications.webhookUrl}
                />
                <p className="text-xs text-muted-foreground">
                  Optional webhook endpoint for real-time notifications
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Export Settings */}
        <TabsContent value="export" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Export Configuration</CardTitle>
              <CardDescription>
                Default settings for data export and formatting
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Default Export Format</Label>
                  <Select value={settings.export.defaultFormat}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="csv">CSV</SelectItem>
                      <SelectItem value="json">JSON</SelectItem>
                      <SelectItem value="xlsx">Excel (XLSX)</SelectItem>
                      <SelectItem value="xml">XML</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Duplicate Handling</Label>
                  <Select value={settings.export.duplicateHandling}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="skip">Skip Duplicates</SelectItem>
                      <SelectItem value="keep">Keep All</SelectItem>
                      <SelectItem value="merge">Merge Data</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Include Headers</Label>
                    <p className="text-xs text-muted-foreground">
                      Add column headers to exported files
                    </p>
                  </div>
                  <Switch checked={settings.export.includeHeaders} />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable Compression</Label>
                    <p className="text-xs text-muted-foreground">
                      Compress large export files automatically
                    </p>
                  </div>
                  <Switch checked={settings.export.compression} />
                </div>
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <Label>Export Templates</Label>
                <div className="flex gap-2">
                  <Badge variant="secondary">Standard Template</Badge>
                  <Badge variant="outline">Marketing List</Badge>
                  <Badge variant="outline">Contact Database</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Pre-configured export formats for different use cases
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Settings */}
        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Security Configuration</CardTitle>
              <CardDescription>
                Authentication and data protection settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Session Timeout (minutes)</Label>
                  <Input 
                    type="number" 
                    value={settings.security.sessionTimeout}
                    placeholder="60"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Password Policy</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select policy" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">Basic (8 characters)</SelectItem>
                      <SelectItem value="medium">Medium (12 characters + symbols)</SelectItem>
                      <SelectItem value="strong">Strong (16 characters + complexity)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Two-Factor Authentication</Label>
                    <p className="text-xs text-muted-foreground">
                      Require 2FA for account access
                    </p>
                  </div>
                  <Switch checked={settings.security.twoFactorAuth} />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Encrypt Stored Data</Label>
                    <p className="text-xs text-muted-foreground">
                      Encrypt sensitive data at rest
                    </p>
                  </div>
                  <Switch checked={settings.security.encryptData} />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Audit Logging</Label>
                    <p className="text-xs text-muted-foreground">
                      Log all user actions and system events
                    </p>
                  </div>
                  <Switch checked={settings.security.auditLog} />
                </div>
              </div>
              
              <Separator />
              
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-medium text-amber-700 dark:text-amber-400">
                      Security Recommendations
                    </h4>
                    <ul className="text-xs text-amber-600 dark:text-amber-300 mt-1 space-y-1">
                      <li>• Enable two-factor authentication for enhanced security</li>
                      <li>• Use strong, unique passwords for all accounts</li>
                      <li>• Regularly review audit logs for suspicious activity</li>
                      <li>• Keep your application and dependencies updated</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;