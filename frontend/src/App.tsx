import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import LandingPage from '@/pages/LandingPage'
import LoginPage from '@/pages/LoginPage'
import DashboardITPage from '@/pages/it/DashboardPage'
import ITLayout from '@/pages/it/ITLayout'
import TeamsPage from '@/pages/it/TeamsPage'
import UsersPage from '@/pages/it/UsersPage'
import PortalPlaceholder from '@/pages/PortalPlaceholder'
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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login/:portalId" element={<LoginPage />} />
        <Route path="/it" element={<ITLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardITPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="teams" element={<TeamsPage />} />
        </Route>
        <Route path="/employee" element={<EmployeeLayout />}>
          <Route index element={<Navigate to="timesheets" replace />} />
          <Route path="timesheets" element={<TimesheetsPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="paystubs" element={<PayStubsPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
        <Route path="/manager" element={<PortalPlaceholder name="Manager" />} />
        <Route path="/payroll" element={<PayrollAdminLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<PayrollDashboardPage />} />
          <Route path="directory" element={<EmployeeDirectoryPage />} />
          <Route path="records" element={<EmployeeRecordsPage />} />
          <Route path="records/:id" element={<EmployeeRecordsPage />} />
          <Route path="releases" element={<PayrollReleasesPage />} />
          <Route path="audit" element={<PayrollAuditPage />} />
        </Route>
        <Route path="*" element={<LandingPage />} />
      </Routes>
    </BrowserRouter>
  )
}
