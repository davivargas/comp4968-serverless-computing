export function StatCards({ total, active, deactivated }: { total: number; active: number; deactivated: number }) {
  const stats = [
    { label: 'Total users', value: total },
    { label: 'Active', value: active },
    { label: 'Deactivated', value: deactivated },
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
