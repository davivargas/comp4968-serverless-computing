import { useState, type FormEvent } from 'react'
import { KeyRound, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { authEnabled, authErrorMessage, changePassword, passwordOk } from '@/lib/auth'
import { PasswordInput, PasswordRules } from './PasswordFields'
import { useSession } from './session-context'

/** Sidebar footer shared by every portal: change password (real sign-in only) and sign out. */
export default function AccountMenu() {
  const { signOut } = useSession()
  const [open, setOpen] = useState(false)
  return (
    <>
      <SidebarMenu>
        {authEnabled && (
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Change password" onClick={() => setOpen(true)}>
              <KeyRound />
              <span>Change password</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
        <SidebarMenuItem>
          <SidebarMenuButton tooltip="Sign out" onClick={signOut}>
            <LogOut />
            <span>Sign out</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>{open && <ChangePasswordForm onDone={() => setOpen(false)} />}</DialogContent>
      </Dialog>
    </>
  )
}

function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const mismatch = confirm !== '' && next !== confirm
  const ready = current && passwordOk(next) && next === confirm

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await changePassword(current, next)
      toast.success('Password changed')
      onDone()
    } catch (e) {
      const err = e as { name?: string }
      // Cognito says "Incorrect username or password" when the current password is wrong.
      setError(err.name === 'NotAuthorizedException' ? 'Your current password is incorrect.' : authErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Change password</DialogTitle>
        <DialogDescription>You'll stay signed in on this device.</DialogDescription>
      </DialogHeader>
      <PasswordInput id="current-password" label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
      <PasswordInput id="new-password" label="New password" value={next} onChange={setNext} autoComplete="new-password" />
      <PasswordRules password={next} />
      <PasswordInput id="confirm-password" label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
      {mismatch && <p className="text-xs text-destructive">The passwords don't match.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={busy || !ready}>{busy ? 'Saving…' : 'Change password'}</Button>
      </DialogFooter>
    </form>
  )
}
