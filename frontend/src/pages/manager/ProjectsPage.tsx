import { useState } from 'react'
import { toast } from 'sonner'
import PageHeader from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { managerApi } from '@/lib/manager/api'
import { CURRENT_MANAGER } from '@/lib/manager/session'
import type { ManagerProject, ProjectEmployees } from '@/lib/manager/types'
import { useManagerData } from '@/lib/manager/useManagerData'

export default function ProjectsPage() {
  const { employees, projects, loading, error, reload, run, busy } = useManagerData()
  const [editing, setEditing] = useState<ManagerProject | 'new' | null>(null)
  const [name, setName] = useState(''), [code, setCode] = useState('')
  const [selected, setSelected] = useState<ManagerProject | null>(null)
  const [members, setMembers] = useState<ProjectEmployees | null>(null)
  const [memberError, setMemberError] = useState(''), [memberLoading, setMemberLoading] = useState(false)
  const [employeeId, setEmployeeId] = useState('')
  const [deleting, setDeleting] = useState<ManagerProject | null>(null)
  function edit(p: ManagerProject | 'new') { setName(p === 'new' ? '' : p.name); setCode(''); setEditing(p) }
  async function save() {
    if (!editing) return
    const ok = await run(() => editing === 'new'
      ? managerApi.createProject({ name, projectCode: code ? Number(code) : undefined })
      : managerApi.updateProject(editing.projectId, { name }), editing === 'new' ? 'Project created' : 'Project updated')
    if (ok) setEditing(null)
  }
  async function loadMembers(p: ManagerProject) {
    setSelected(p); setMembers(null); setMemberError(''); setMemberLoading(true); setEmployeeId('')
    try { setMembers(await managerApi.projectEmployees(p.projectId)) }
    catch (e) { setMemberError(e instanceof Error ? e.message : 'Unable to load assignments') }
    finally { setMemberLoading(false) }
  }
  async function assign() {
    if (!selected) return
    const p = selected
    const ok = await run(async () => {
      const r = await managerApi.assignEmployee(p.projectId, employeeId)
      if (r.alreadyAssigned) toast.info('Employee is already assigned')
    }, 'Assignment saved')
    if (ok) await loadMembers(p)
  }
  return <div className="mx-auto max-w-6xl"><PageHeader title="Projects" description="Create project codes and assign your team to active projects."><Button onClick={() => edit('new')}>Create project</Button></PageHeader>
    {error ? <div role="alert">{error} <Button onClick={() => void reload()}>Retry</Button></div> : loading ? <Skeleton className="h-64" /> : <Card><CardContent><Table><TableHeader><TableRow>{['Code', 'Project', 'Status', 'Employees', 'Actions'].map(h => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{projects.map(p => <TableRow key={p.projectId}><TableCell>{p.projectCode}</TableCell><TableCell className="font-medium">{p.name}</TableCell><TableCell><Badge variant={p.status === 'ACTIVE' ? 'secondary' : 'outline'}>{p.status}</Badge></TableCell><TableCell>{p.employeeCount}</TableCell><TableCell><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => void loadMembers(p)}>Assignments</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => edit(p)}>Rename</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => managerApi.updateProject(p.projectId, { status: p.status === 'ACTIVE' ? 'CLOSED' : 'ACTIVE' }), 'Project status updated')}>{p.status === 'ACTIVE' ? 'Close' : 'Reopen'}</Button><Button size="sm" variant="ghost" disabled={busy || p.employeeCount > 0} onClick={() => setDeleting(p)}>Delete</Button></div></TableCell></TableRow>)}{!projects.length && <TableRow><TableCell colSpan={5}>No projects yet. Create your first project to get started.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>}
    <Dialog open={!!editing} onOpenChange={open => { if (!open && !busy) setEditing(null) }}><DialogContent><form onSubmit={e => { e.preventDefault(); void save() }}><DialogHeader><DialogTitle>{editing === 'new' ? 'Create project' : 'Rename project'}</DialogTitle><DialogDescription>Project codes are unique and cannot be reused.</DialogDescription></DialogHeader><div className="my-5 grid gap-4"><div className="grid gap-2"><Label htmlFor="project-name">Project name</Label><Input id="project-name" required value={name} onChange={e => setName(e.target.value)} /></div>{editing === 'new' && <div className="grid gap-2"><Label htmlFor="project-code">Project code (optional)</Label><Input id="project-code" type="number" min="1" step="1" placeholder="Automatically generated" value={code} onChange={e => setCode(e.target.value)} /></div>}</div><DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(null)}>Cancel</Button><Button disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save project'}</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={!!selected} onOpenChange={open => { if (!open && !busy && !memberLoading) setSelected(null) }}><DialogContent><DialogHeader><DialogTitle>{selected?.name} assignments</DialogTitle><DialogDescription>Only active team members or yourself can be assigned to an active project.</DialogDescription></DialogHeader>
      {memberLoading ? <Skeleton className="h-24" /> : memberError ? <p role="alert">{memberError} <Button variant="outline" onClick={() => selected && void loadMembers(selected)}>Retry</Button></p> : <div className="grid gap-2">{members?.employees.map(e => <div key={e.employeeId} className="flex justify-between text-sm"><span>{e.firstName} {e.lastName}</span><Badge variant="outline">{e.status}</Badge></div>)}{!members?.employees.length && <p className="text-sm text-muted-foreground">No employees assigned.</p>}</div>}
      <Label htmlFor="assign-employee">Assign employee</Label><select id="assign-employee" className="h-9 rounded-md border bg-background px-3 text-sm" value={employeeId} disabled={memberLoading || busy || selected?.status !== 'ACTIVE'} onChange={e => setEmployeeId(e.target.value)}><option value="">Choose employee</option>{[...employees.filter(e => e.status === 'ACTIVE'), { employeeId: CURRENT_MANAGER.id, firstName: CURRENT_MANAGER.firstName, lastName: 'Johnson' }].filter(e => !members?.employees.some(m => m.employeeId === e.employeeId)).map(e => <option key={e.employeeId} value={e.employeeId}>{e.firstName} {e.lastName}</option>)}</select>
      {selected?.status === 'CLOSED' && <p className="text-sm text-muted-foreground">Reopen this project to add assignments.</p>}
      <DialogFooter><Button disabled={!employeeId || busy || memberLoading || selected?.status !== 'ACTIVE'} onClick={() => void assign()}>{busy ? 'Saving…' : 'Assign employee'}</Button></DialogFooter>
    </DialogContent></Dialog>
    <Dialog open={!!deleting} onOpenChange={open => { if (!open && !busy) setDeleting(null) }}><DialogContent><DialogHeader><DialogTitle>Delete {deleting?.name}?</DialogTitle><DialogDescription>Only projects without assignments or timesheet history can be deleted. Close a project to keep its history.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" disabled={busy} onClick={async () => { if (deleting && await run(() => managerApi.updateProject(deleting.projectId, { isDeleted: true }), 'Project deleted')) setDeleting(null) }}>Delete project</Button></DialogFooter></DialogContent></Dialog>
  </div>
}
