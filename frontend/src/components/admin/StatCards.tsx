import type { Employee } from '@/lib/types'

export function StatCards({ employees }: { employees: Employee[] }) {
  const active = employees.filter((e) => e.active).length
  const stats = [
    { label: 'Total users', value: employees.length },
    { label: 'Active', value: active },
    { label: 'Deactivated', value: employees.length - active },
  ]
  return (
    <dl className="grid grid-cols-3 divide-x rounded-lg border bg-card">
      {stats.map(({ label, value }) => (
        <div key={label} className="px-5 py-4">
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="mt-1 text-3xl font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
