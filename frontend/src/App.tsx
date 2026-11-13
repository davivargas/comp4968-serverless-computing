import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AuthRoot from '@/components/auth/AuthRoot'
import RequireRole from '@/components/auth/RequireRole'
import { PORTALS } from '@/lib/portals'
import LandingPage from '@/pages/LandingPage'
import LoginPage from '@/pages/LoginPage'
import DashboardITPage from '@/pages/it/DashboardPage'
import ITLayout from '@/pages/it/ITLayout'
import TeamsPage from '@/pages/it/TeamsPage'
import UsersPage from '@/pages/it/UsersPage'
import DashboardPage from '@/pages/employee/DashboardPage'
import EmployeeLayout from '@/pages/employee/EmployeeLayout'
import PayStubsPage from '@/pages/employee/PayStubsPage'
import ProfilePage from '@/pages/employee/ProfilePage'
import TimesheetsPage from '@/pages/employee/TimesheetsPage'
import PayrollAdminLayout from '@/pages/payroll_admin/PayrollAdminLayout'
import PayrollDashboardPage from '@/pages/payroll_admin/DashboardPage'
import EmployeeDirectoryPage from '@/pages/payroll_admin/EmployeeDirectoryPage'
import EmployeeRecordsPage from '@/pages/payroll_admin/EmployeeRecordsPage'
import PayrollReleasesPage from '@/pages/payroll_admin/PayrollReleasesPage'
import PayrollAuditPage from '@/pages/payroll_admin/PayrollAuditPage'
import ManagerLayout from '@/pages/manager/ManagerLayout'
import ManagerDashboardPage from '@/pages/manager/DashboardPage'
import ManagerTimesheetsPage from '@/pages/manager/TimesheetsPage'
import ManagerProjectsPage from '@/pages/manager/ProjectsPage'
import ManagerTeamPage from '@/pages/manager/TeamPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthRoot>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login/:portalId" element={<LoginPage />} />
        <Route path="/it" element={<Guard portalId="it"><ITLayout /></Guard>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardITPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="teams" element={<TeamsPage />} />
        </Route>
        <Route path="/employee" element={<Guard portalId="employee"><EmployeeLayout /></Guard>}>
          <Route index element={<Navigate to="timesheets" replace />} />
          <Route path="timesheets" element={<TimesheetsPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="paystubs" element={<PayStubsPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
        <Route path="/payroll" element={<Guard portalId="payroll"><PayrollAdminLayout /></Guard>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<PayrollDashboardPage />} />
          <Route path="directory" element={<EmployeeDirectoryPage />} />
          <Route path="records" element={<EmployeeRecordsPage />} />
          <Route path="records/:id" element={<EmployeeRecordsPage />} />
          <Route path="releases" element={<PayrollReleasesPage />} />
          <Route path="audit" element={<PayrollAuditPage />} />
        </Route>
        <Route path="/manager" element={<Guard portalId="manager"><ManagerLayout /></Guard>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<ManagerDashboardPage />} />
          <Route path="timesheets" element={<ManagerTimesheetsPage />} />
          <Route path="projects" element={<ManagerProjectsPage />} />
          <Route path="team" element={<ManagerTeamPage />} />
        </Route>
        <Route path="*" element={<LandingPage />} />
      </Routes>
      </AuthRoot>
    </BrowserRouter>
  )
}

/** Signed in and holding the portal's role (always passes with the mock API). */
function Guard({ portalId, children }: { portalId: string; children: ReactNode }) {
  const portal = PORTALS.find((p) => p.id === portalId)!
  return <RequireRole role={portal.role} portalId={portal.id} portalName={portal.name}>{children}</RequireRole>
}
