import { BrowserRouter, Route, Routes } from 'react-router-dom'
import LandingPage from '@/pages/LandingPage'
import LoginPage from '@/pages/LoginPage'
import PortalPlaceholder from '@/pages/PortalPlaceholder'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login/:portalId" element={<LoginPage />} />
        <Route path="/it" element={<PortalPlaceholder name="IT Admin" />} />
        <Route path="/employee" element={<PortalPlaceholder name="Employee" />} />
        <Route path="/manager" element={<PortalPlaceholder name="Manager" />} />
        <Route path="/payroll" element={<PortalPlaceholder name="Payroll Admin" />} />
        <Route path="*" element={<LandingPage />} />
      </Routes>
    </BrowserRouter>
  )
}
