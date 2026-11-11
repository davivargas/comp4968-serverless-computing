import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import LandingPage from '@/pages/LandingPage'
import LoginPage from '@/pages/LoginPage'
import DashboardITPage from '@/pages/it/DashboardPage'
import ITLayout from '@/pages/it/ITLayout'
import UsersPage from '@/pages/it/UsersPage'
import PortalPlaceholder from '@/pages/PortalPlaceholder'
import DashboardPage from '@/pages/employee/DashboardPage'
import EmployeeLayout from '@/pages/employee/EmployeeLayout'
import PayStubsPage from '@/pages/employee/PayStubsPage'
import ProfilePage from '@/pages/employee/ProfilePage'
import TimesheetsPage from '@/pages/employee/TimesheetsPage'

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
        </Route>
        <Route path="/employee" element={<EmployeeLayout />}>
          <Route index element={<Navigate to="timesheets" replace />} />
          <Route path="timesheets" element={<TimesheetsPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="paystubs" element={<PayStubsPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
        <Route path="/manager" element={<PortalPlaceholder name="Manager" />} />
        <Route path="/payroll" element={<PortalPlaceholder name="Payroll Admin" />} />
        <Route path="*" element={<LandingPage />} />
      </Routes>
    </BrowserRouter>
  )
}
