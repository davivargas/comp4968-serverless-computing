import { useNavigate } from 'react-router-dom'
import { Bell, ChevronDown, ChevronUp, LayoutDashboard, LogOut, Timer, Users } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader,
  SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from '@/components/ui/sidebar'
import { currentUser } from '@/lib/currentUser'

export type View = 'dashboard' | 'users'

const NAV: { view: View; label: string; icon: typeof Users }[] = [
  { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { view: 'users', label: 'Users', icon: Users },
]

function ProfileMenu({ trigger, side }: { trigger: React.ReactNode; side: 'top' | 'bottom' }) {
  const navigate = useNavigate()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="font-medium">{currentUser.name}</div>
          <div className="text-xs font-normal text-muted-foreground">{currentUser.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/')}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AdminShell({
  view, onNavigate, children,
}: {
  view: View
  onNavigate: (v: View) => void
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <Timer className="size-5" />
            </div>
            <div className="leading-tight">
              <div className="font-semibold">Timesheet Pro</div>
              <div className="text-xs text-muted-foreground">Timesheet Management System</div>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV.map(({ view: v, label, icon: Icon }) => (
                  <SidebarMenuItem key={v}>
                    <SidebarMenuButton size="lg" isActive={v === view} onClick={() => onNavigate(v)}
                      className="data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground">
                      <Icon /> {label}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t p-3">
          <ProfileMenu side="top" trigger={
            <button className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-sidebar-accent">
              <Avatar><AvatarFallback className="bg-primary text-primary-foreground">{currentUser.initials}</AvatarFallback></Avatar>
              <div className="flex-1 leading-tight">
                <div className="text-sm font-medium">{currentUser.name}</div>
                <div className="text-xs text-muted-foreground">{currentUser.roleLabel}</div>
              </div>
              <ChevronUp className="size-4" />
            </button>
          } />
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-16 items-center gap-3 border-b px-4">
          <SidebarTrigger className="md:hidden" />
          <h1 className="text-lg font-semibold">IT Portal</h1>
          <div className="ml-auto flex items-center gap-3">
            <Button variant="ghost" size="icon" aria-label="Notifications"><Bell /></Button>
            <ProfileMenu side="bottom" trigger={
              <button className="flex items-center gap-2 rounded-md p-1 hover:bg-accent">
                <Avatar className="size-8"><AvatarFallback className="bg-primary text-primary-foreground">{currentUser.initials}</AvatarFallback></Avatar>
                <span className="hidden text-sm font-medium sm:inline">{currentUser.name}</span>
                <ChevronDown className="size-4" />
              </button>
            } />
          </div>
        </header>
        <main className="flex-1 bg-muted/30 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
