import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import { ComingSoon } from "@/components/ComingSoon";
import { RecoveryHashHandler } from "@/components/RecoveryHashHandler";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Properties from "./pages/Properties";
import PropertyDetail from "./pages/PropertyDetail";
import Tasks from "./pages/Tasks";
import Team from "./pages/Team";
import CohostDetail from "./pages/CohostDetail";
import Anomalies from "./pages/Anomalies";
import Reservations from "./pages/Reservations";
import Inventory from "./pages/Inventory";
import Settings from "./pages/Settings";
import Help from "./pages/Help";
import Availability from "./pages/Availability";
import Rentals from "./pages/Rentals";
import Auth from "./pages/Auth";
import Welcome from "./pages/Welcome";
import StaffLogin from "./pages/StaffLogin";
import ResetPassword from "./pages/ResetPassword";
import GuestBook from "./pages/GuestBook";
import GuestReservation from "./pages/GuestReservation";
import GuestBooks from "./pages/GuestBooks";
import ReportIssue from "./pages/ReportIssue";
import Tickets from "./pages/Tickets";
import Showcase from "./pages/Showcase";
import BookingRequests from "./pages/BookingRequests";
import Reports from "./pages/Reports";
import SuperAdmin from "./pages/SuperAdmin";
import SuperAdminBilling from "./pages/SuperAdminBilling";
import SuperAdminOrg from "./pages/SuperAdminOrg";
import SuperAdminOtherProfiles from "./pages/SuperAdminOtherProfiles";
import SuperAdminAdmins from "./pages/SuperAdminAdmins";
import SuperAdminCohosts from "./pages/SuperAdminCohosts";
import SuperAdminEmployees from "./pages/SuperAdminEmployees";
import SuperAdminStaff from "./pages/SuperAdminStaff";
import AdminCohosts from "./pages/AdminCohosts";
import AdminEmployees from "./pages/AdminEmployees";
import MyInvoices from "./pages/MyInvoices";
import GuestPortal from "./pages/GuestPortal";
import RedeemCoupon from "./pages/RedeemCoupon";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const Router: typeof BrowserRouter = (window.location.protocol === "file:" ? HashRouter : BrowserRouter) as any;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <Router>
        <AuthProvider>
          {/* Catches password-recovery URL fragments (expired tokens land
              on `/#error=...`; valid tokens may land anywhere if the
              Supabase URL allowlist is misconfigured) and routes the user
              to the right place. */}
          <RecoveryHashHandler />
          <Routes>
            <Route path="/welcome" element={<Welcome />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/staff-login" element={<StaffLogin />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/g/:slug" element={<GuestBook />} />
            <Route path="/s/:slug" element={<GuestReservation />} />
            <Route path="/r/:slug" element={<ReportIssue />} />
            <Route path="/v/:orgId" element={<Showcase />} />
            <Route path="/redeem/:code" element={<RedeemCoupon />} />
            <Route path="/guest" element={<ProtectedRoute><GuestPortal /></ProtectedRoute>} />
            <Route path="/guest-preview/:reservationId" element={<ProtectedRoute><GuestPortal /></ProtectedRoute>} />
            <Route
              path="/super-admin"
              element={
                <ProtectedRoute>
                  <AppLayout><SuperAdmin /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/super-admin/orgs/:id"
              element={
                <ProtectedRoute>
                  <AppLayout><SuperAdminOrg /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/super-admin/billing"
              element={
                <ProtectedRoute>
                  <AppLayout><SuperAdminBilling /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/super-admin/profiles"
              element={
                <ProtectedRoute>
                  <AppLayout><SuperAdminOtherProfiles /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/super-admin/admins"
              element={
                <ProtectedRoute>
                  <AppLayout><SuperAdminAdmins /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/super-admin/cohosts"
              element={
                <ProtectedRoute>
                  <AppLayout><SuperAdminCohosts /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/super-admin/employees"
              element={
                <ProtectedRoute>
                  <AppLayout><SuperAdminEmployees /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/super-admin/staff"
              element={
                <ProtectedRoute>
                  <AppLayout><SuperAdminStaff /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route path="/invoices" element={<ProtectedRoute><AppLayout><MyInvoices /></AppLayout></ProtectedRoute>} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppLayout><Home /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/dashboard"
              element={
                <ProtectedRoute>
                  <AppLayout><Home /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/cohosts"
              element={
                <ProtectedRoute>
                  <AppLayout><AdminCohosts /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/employees"
              element={
                <ProtectedRoute>
                  <AppLayout><AdminEmployees /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/cohost/dashboard"
              element={
                <ProtectedRoute>
                  <AppLayout><Home /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/employee"
              element={
                <ProtectedRoute>
                  <AppLayout><Home /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/properties"
              element={
                <ProtectedRoute>
                  <AppLayout><Properties /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/properties/:id"
              element={
                <ProtectedRoute>
                  <AppLayout><PropertyDetail /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route path="/team" element={<ProtectedRoute><AppLayout><Team /></AppLayout></ProtectedRoute>} />
            <Route path="/cohosts/:id" element={<ProtectedRoute><AppLayout><CohostDetail /></AppLayout></ProtectedRoute>} />
            <Route path="/anomalies" element={<ProtectedRoute><AppLayout><Anomalies /></AppLayout></ProtectedRoute>} />
            <Route path="/reservations" element={<ProtectedRoute><AppLayout><Reservations /></AppLayout></ProtectedRoute>} />
            <Route path="/tasks" element={<ProtectedRoute><AppLayout><Tasks /></AppLayout></ProtectedRoute>} />
            <Route path="/inventory" element={<ProtectedRoute><AppLayout><Inventory /></AppLayout></ProtectedRoute>} />
            <Route path="/availability" element={<ProtectedRoute><AppLayout><Availability /></AppLayout></ProtectedRoute>} />
            <Route path="/rentals" element={<ProtectedRoute><AppLayout><Rentals /></AppLayout></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><AppLayout><Settings /></AppLayout></ProtectedRoute>} />
            <Route path="/guest-books" element={<ProtectedRoute><AppLayout><GuestBooks /></AppLayout></ProtectedRoute>} />
            <Route path="/tickets" element={<ProtectedRoute><AppLayout><Tickets /></AppLayout></ProtectedRoute>} />
            <Route path="/showcase" element={<ProtectedRoute><AppLayout><BookingRequests /></AppLayout></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute><AppLayout><Reports /></AppLayout></ProtectedRoute>} />
            <Route path="/help" element={<ProtectedRoute><AppLayout><Help /></AppLayout></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </Router>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
