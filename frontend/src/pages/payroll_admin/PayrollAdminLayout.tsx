import { Bell, FileText, LayoutDashboard, LogOut, Users, WalletCards } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ModeToggle } from '@/components/mode-toggle'
import { Separator } from '@/components/ui/separator'
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { APP_NAME } from '@/lib/brand'
import { usingMockApi } from '@/lib/payroll_admin/api'

const NAV = [
  { to: '/payroll/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/payroll/directory', label: 'Employee Directory', icon: Users },
  { to: '/payroll/records', label: 'Employee Records', icon: FileText },
  { to: '/payroll/releases', label: 'Payroll Releases', icon: WalletCards },
]

export default function PayrollAdminLayout() {
  const { pathname } = useLocation()
  const current = NAV.find((item) => pathname.startsWith(item.to))
  return <TooltipProvider><SidebarProvider><Sidebar collapsible="icon"><SidebarHeader><SidebarMenu><SidebarMenuItem><SidebarMenuButton size="lg" asChild><Link to="/payroll"><div className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">PA</div><div className="grid leading-tight"><span className="font-semibold">{APP_NAME}</span><span className="text-xs text-muted-foreground">Payroll Admin portal</span></div></Link></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarHeader><SidebarContent><SidebarGroup><SidebarGroupContent><SidebarMenu>{NAV.map(({ to, label, icon: Icon }) => <SidebarMenuItem key={to}><SidebarMenuButton asChild isActive={pathname.startsWith(to)} tooltip={label}><NavLink to={to}><Icon /><span>{label}</span></NavLink></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent><SidebarFooter><SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild tooltip="Sign out"><Link to="/"><LogOut /><span>Sign out</span></Link></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarFooter><SidebarRail /></Sidebar><SidebarInset><header className="flex h-14 shrink-0 items-center gap-2 border-b px-4"><SidebarTrigger className="-ml-1" /><Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" /><span className="text-sm font-medium">{current?.label}</span><div className="ml-auto flex items-center gap-3"><Bell className="size-4 text-muted-foreground" /><span className="hidden text-sm sm:inline">Hi, <span className="font-medium">Priya</span></span>{usingMockApi && <span className="rounded-md border px-2 py-0.5 text-xs text-muted-foreground">Mock API</span>}<ModeToggle /></div></header><div className="flex-1 p-4 md:p-6"><Outlet /></div></SidebarInset></SidebarProvider><Toaster position="bottom-right" /></TooltipProvider>
}
