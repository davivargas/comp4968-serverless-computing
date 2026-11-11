import { CalendarClock, FileText, LayoutDashboard, LogOut, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ModeToggle } from '@/components/mode-toggle'
import { Separator } from '@/components/ui/separator'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarInset,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger,
} from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { APP_NAME } from '@/lib/brand'
import { employeeApi, usingMockApi } from '@/lib/employee/api'
import { CURRENT_EMPLOYEE_ID } from '@/lib/employee/session'

const NAV = [
  { to: '/employee/timesheets', label: 'Timesheets', icon: CalendarClock },
  { to: '/employee/dashboard', label: 'Pay dashboard', icon: LayoutDashboard },
  { to: '/employee/paystubs', label: 'Pay stubs', icon: FileText },
  { to: '/employee/profile', label: 'My profile', icon: UserRound },
]

export default function EmployeeLayout() {
  const { pathname } = useLocation()
  const current = NAV.find((n) => pathname.startsWith(n.to))
  const [firstName, setFirstName] = useState<string | null>(null)

  useEffect(() => {
    employeeApi.getProfile(CURRENT_EMPLOYEE_ID).then((p) => setFirstName(p.firstName)).catch(() => {})
  }, [])

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" asChild>
                  <Link to="/employee">
                    <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">{APP_NAME[0]}</div>
                    <div className="grid leading-tight">
                      <span className="font-semibold">{APP_NAME}</span>
                      <span className="text-xs text-muted-foreground">Employee portal</span>
                    </div>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {NAV.map(({ to, label, icon: Icon }) => (
                    <SidebarMenuItem key={to}>
                      <SidebarMenuButton asChild isActive={pathname.startsWith(to)} tooltip={label}>
                        <NavLink to={to}>
                          <Icon />
                          <span>{label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Sign out">
                  <Link to="/">
                    <LogOut />
                    <span>Sign out</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset>
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <span className="text-sm font-medium">{current?.label}</span>
            <div className="ml-auto flex items-center gap-3">
              {firstName && <span className="text-sm">Hi, <span className="font-medium">{firstName}</span></span>}
              {usingMockApi && <span className="rounded-md border px-2 py-0.5 text-xs text-muted-foreground">Mock API</span>}
              <ModeToggle />
            </div>
          </header>
          <div className="flex-1 p-4 md:p-6">
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}

