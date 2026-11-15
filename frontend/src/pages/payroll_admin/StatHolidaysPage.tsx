import { CalendarDays, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { payrollAdminApi } from '@/lib/payroll_admin/api'
import type { StatHoliday } from '@/lib/payroll_admin/types'
import { toast } from 'sonner'

export default function StatHolidaysPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [holidays, setHolidays] = useState<StatHoliday[]>([])
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => payrollAdminApi.listStatHolidays(year).then(setHolidays).catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not load stat holidays'))
  useEffect(() => { void load() }, [year])
  const add = async () => {
    setBusy(true)
    try { await payrollAdminApi.addStatHoliday({ date, name }); setDate(''); setName(''); toast.success('Stat holiday added'); await load() }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not add stat holiday') }
    finally { setBusy(false) }
  }
  const remove = async (holidayDate: string) => {
    try { await payrollAdminApi.deleteStatHoliday(holidayDate); toast.success('Stat holiday removed'); await load() }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not remove stat holiday') }
  }
  return <div className="mx-auto max-w-4xl"><PageHeader title="Stat Holidays" description="Manage holiday dates used by timesheets and payroll." /><Card className="mb-5"><CardContent className="grid gap-3 pt-6 sm:grid-cols-[1fr_2fr_auto]"><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label="Holiday date" /><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Holiday name" aria-label="Holiday name" /><Button disabled={busy || !date || !name.trim()} onClick={() => void add()}><Plus /> Add holiday</Button></CardContent></Card><div className="mb-4 flex items-center gap-3"><label className="text-sm font-medium" htmlFor="holiday-year">Year</label><Input id="holiday-year" type="number" min="2000" max="9999" className="w-32" value={year} onChange={(event) => setYear(Number(event.target.value))} /></div><Card><CardContent className="divide-y p-0">{holidays.map((holiday) => <div className="flex items-center justify-between gap-4 p-4" key={holiday.date}><div className="flex items-center gap-3"><CalendarDays className="size-4 text-primary" /><div><p className="font-medium">{holiday.name}</p><p className="text-sm text-muted-foreground">{holiday.date}</p></div></div><Button size="icon" variant="ghost" aria-label={`Remove ${holiday.name}`} onClick={() => void remove(holiday.date)}><Trash2 className="size-4" /></Button></div>)}{holidays.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No stat holidays are listed for {year}.</p>}</CardContent></Card></div>
}
