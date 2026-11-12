import { RotateCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

/** Shown in place of a page's content when its data couldn't be loaded, so it never spins forever. */
export default function LoadError({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <TriangleAlert className="size-6 text-muted-foreground" />
        <div>
          <p className="font-medium">{title}</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">{message}</p>
        </div>
        <Button variant="outline" onClick={onRetry}><RotateCw />Try again</Button>
      </CardContent>
    </Card>
  )
}
