import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { MainLayout } from "./components/MainLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { SuperAdminRoute } from "./components/SuperAdminRoute";
import { SupabaseRealtimeProvider } from "./contexts/SupabaseRealtimeContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import { SubscriptionProvider } from "./contexts/SubscriptionContext";
import Dashboard from "./pages/Dashboard";
import EmailAccountsAndJobs from "./pages/EmailAccountsAndJobs";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ProxyManager from "./pages/ProxyManager";
import Results from "./pages/Results";
import Settings from "./pages/Settings";
import Billing from "./pages/Billing";
import SuperAdmin from "./pages/SuperAdmin";
import NotFound from "./pages/NotFound";
import { AuthDebug } from "./components/AuthDebug";

const App = () => (
    <ThemeProvider defaultTheme="dark" storageKey="mail-discovery-theme">
      <AuthProvider>
        <SubscriptionProvider>
          <SupabaseRealtimeProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <AuthDebug />
              <BrowserRouter>
              <Routes>
                {/* Public routes */}
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                
                {/* Protected routes */}
                <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="email-accounts" element={<EmailAccountsAndJobs />} />
                  <Route path="proxies" element={<ProxyManager />} />
                  <Route path="jobs" element={<EmailAccountsAndJobs />} />
                  <Route path="results" element={<Results />} />
                  <Route path="billing" element={<Billing />} />
                  <Route path="admin" element={<SuperAdminRoute><SuperAdmin /></SuperAdminRoute>} />
                  <Route path="users" element={<SuperAdminRoute><div className="p-8">Users page coming soon...</div></SuperAdminRoute>} />
                  <Route path="api-keys" element={<SuperAdminRoute><div className="p-8">API Keys page coming soon...</div></SuperAdminRoute>} />
                  <Route path="reports" element={<SuperAdminRoute><div className="p-8">Reports page coming soon...</div></SuperAdminRoute>} />
                  <Route path="settings" element={<Settings />} />
                </Route>
                
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
            </TooltipProvider>
          </SupabaseRealtimeProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </ThemeProvider>
);

export default App;
