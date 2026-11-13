import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { fullName, roleLabel, type Role, type User } from '@/lib/it/types'

export interface PendingRoleChange { user: User; role: Role }

export function ConfirmRoleDialog({
  change, onClose, onConfirm,
}: { change: PendingRoleChange | null; onClose: () => void; onConfirm: (c: PendingRoleChange) => void }) {
  return (
    <AlertDialog open={!!change} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Change access role?</AlertDialogTitle>
          <AlertDialogDescription>
            {change && <>Change {fullName(change.user)} ({change.user.employeeId}) from <b>{roleLabel(change.user.role)}</b> to <b>{roleLabel(change.role)}</b>.</>}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => onConfirm(change!)}>Confirm</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
