import { LayoutDashboard, LogOut, Network, Users } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ModeToggle } from '@/components/mode-toggle'
import { Separator } from '@/components/ui/separator'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarInset,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger,
} from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import Mascot from '@/components/Mascot'
import TipBuddy from '@/components/TipBuddy'
import { APP_NAME } from '@/lib/brand'
import { usingMockApi } from '@/lib/it/api'
import { useMe } from '@/lib/it/hooks'

const NAV = [
  { to: '/it/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/it/users', label: 'Users', icon: Users },
  { to: '/it/teams', label: 'Teams', icon: Network },
]

export default function ITLayout() {
  const { pathname } = useLocation()
  const current = NAV.find((n) => pathname.startsWith(n.to))
  const me = useMe()

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" asChild>
                  <Link to="/it">
                    <Mascot className="!size-8 shrink-0" label="" />
                    <div className="grid leading-tight">
                      <span className="font-semibold">{APP_NAME}</span>
                      <span className="text-xs text-muted-foreground">IT portal</span>
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
              {me && <span className="text-sm">Hi, <span className="font-medium">{me.firstName}</span></span>}
              {usingMockApi && <span className="rounded-md border px-2 py-0.5 text-xs text-muted-foreground">Mock API</span>}
              <ModeToggle />
            </div>
          </header>
          <div className="flex-1 p-4 md:p-6">
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
      <TipBuddy /><Toaster position="bottom-right" offset={{ bottom: 96 }} />
    </TooltipProvider>
  )
}
