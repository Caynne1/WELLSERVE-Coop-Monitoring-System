import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/auth/LoginPage';
import DashboardPage from './pages/dashboard/DashboardPage';

// Members
import MembersPage from './pages/members/MembersPage';
import MemberFormPage from './pages/members/MemberFormPage';
import MemberDetailPage from './pages/members/MemberDetailPage';
import PassbookPage from './pages/passbook/PassbookPage'; // ✅ NEW

// Financial categories
import LoansPage from './pages/loans/LoansPage';
import LoanDetailPage from './pages/loans/LoanDetailPage';
import LoanFormPage from './pages/loans/LoanFormPage';
import CBUPage from './pages/cbu/CBUPage';
import SavingsPage from './pages/savings/SavingsPage';

// Operations
import TransactionsPage from './pages/transactions/TransactionsPage';
import CheckbookPage from './pages/checkbook/CheckbookPage';
import InvoicesPage from './pages/invoices/InvoicesPage';
import VouchersPage from './pages/vouchers/VouchersPage';
import ExpensesPage from './pages/expenses/ExpensesPage';

// Analytics
import ReportsPage from './pages/reports/ReportsPage';
import ActivityLogsPage from './pages/logs/ActivityLogsPage';

// Administration
import SettingsPage from './pages/settings/SettingsPage';
import StaffPage from './pages/settings/StaffPage';
import AccountManagementPage from './pages/account-management/AccountManagementPage';
import UserManagementPage from './pages/user-management/UserManagementPage';

// ── NEW: Cooperative Fund Monitoring ──────────────────────────────────────────
import CoopMonitoringPage from './pages/coop-monitoring/CoopMonitoringPage';

// Compatibility routes
import AccountsPage from './pages/accounts/AccountsPage';
import AccountDetailPage from './pages/accounts/AccountDetailPage';
import AccountFormPage from './pages/accounts/AccountFormPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      retry: 1,
    },
  },
});

function FullScreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F3F4F4]">
      <div className="text-center">
        <div className="w-10 h-10 rounded-full border-4 border-[#07A04E]/20 border-t-[#07A04E] animate-spin mx-auto" />
        <p className="mt-3 text-sm text-gray-500">Loading...</p>
      </div>
    </div>
  );
}

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  return user ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  return user ? <Navigate to="/dashboard" replace /> : children;
}

function AdminRoute({ children }) {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

function PermissionRoute({ children, module }) {
  const { user, loading, hasPermission } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!hasPermission(module, 'view')) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <NotificationProvider>
          <Routes>
            {/* Public */}
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <LoginPage />
                </PublicRoute>
              }
            />

            {/* Protected */}
            <Route
              path="/"
              element={
                <PrivateRoute>
                  <AppLayout />
                </PrivateRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />

              {/* Members */}
              <Route path="members" element={<PermissionRoute module="members"><MembersPage /></PermissionRoute>} />
              <Route path="members/new" element={<PermissionRoute module="members"><MemberFormPage /></PermissionRoute>} />
              <Route path="members/:id/edit" element={<PermissionRoute module="members"><MemberFormPage /></PermissionRoute>} />
              <Route path="members/:id" element={<PermissionRoute module="members"><MemberDetailPage /></PermissionRoute>} />
              <Route path="passbook" element={<PermissionRoute module="members"><PassbookPage /></PermissionRoute>} />

              {/* Financial categories */}
              <Route path="loans" element={<PermissionRoute module="loans"><LoansPage /></PermissionRoute>} />
              <Route path="loans/new" element={<PermissionRoute module="loans"><LoanFormPage /></PermissionRoute>} />
              <Route path="loans/:id/edit" element={<PermissionRoute module="loans"><LoanFormPage /></PermissionRoute>} />
              <Route path="loans/:id" element={<PermissionRoute module="loans"><LoanDetailPage /></PermissionRoute>} />
              <Route path="cbu" element={<PermissionRoute module="cbu"><CBUPage /></PermissionRoute>} />
              <Route path="savings" element={<PermissionRoute module="savings"><SavingsPage /></PermissionRoute>} />

              {/* Operations */}
              <Route path="transactions" element={<PermissionRoute module="transactions"><TransactionsPage /></PermissionRoute>} />
              <Route path="checkbook" element={<PermissionRoute module="checkbook"><CheckbookPage /></PermissionRoute>} />
              <Route path="invoices" element={<PermissionRoute module="invoices"><InvoicesPage /></PermissionRoute>} />
              <Route path="vouchers" element={<PermissionRoute module="vouchers"><VouchersPage /></PermissionRoute>} />
              <Route path="expenses" element={<PermissionRoute module="expenses"><ExpensesPage /></PermissionRoute>} />

              {/* Cooperative Monitoring */}
              <Route path="coop-monitoring" element={<CoopMonitoringPage />} />

              {/* Analytics */}
              <Route path="reports" element={<PermissionRoute module="reports"><ReportsPage /></PermissionRoute>} />
              <Route path="logs" element={<PermissionRoute module="logs"><ActivityLogsPage /></PermissionRoute>} />

              {/* Administration */}
              <Route path="settings" element={<PermissionRoute module="settings"><SettingsPage /></PermissionRoute>} />
              <Route path="staff" element={<StaffPage />} />

              {/* Admin only */}
              <Route
                path="account-management"
                element={
                  <AdminRoute>
                    <AccountManagementPage />
                  </AdminRoute>
                }
              />
              <Route
                path="user-management"
                element={
                  <AdminRoute>
                    <UserManagementPage />
                  </AdminRoute>
                }
              />

              {/* Compatibility */}
              <Route path="accounts" element={<AccountsPage />} />
              <Route path="accounts/new" element={<AccountFormPage />} />
              <Route path="accounts/:id/edit" element={<AccountFormPage />} />
              <Route path="accounts/:id" element={<AccountDetailPage />} />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes>

          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3500,
              style: {
                background: '#1f2937',
                color: '#fff',
                fontSize: '14px',
              },
            }}
          />
        </NotificationProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}