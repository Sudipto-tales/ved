// Super-Admin Access (M11) — the tenant-owned consent switch for platform "Login As".
// Off by default: the control plane's impersonation endpoint is denied unless a school
// admin turns this on here. This is the school's control over who can act on its behalf.
import { Badge, Button, Card, Icon, PageHeader, Spinner } from '@/shared/ui';
import { useSetSuperAdminAccess, useSuperAdminAccess } from '../api/accessApi';

export default function SuperAdminAccessPage() {
  const { data, isLoading } = useSuperAdminAccess();
  const setAccess = useSetSuperAdminAccess();
  const allowed = data?.allow_superadmin_access ?? false;

  function toggle() {
    setAccess.mutate(!allowed);
  }

  return (
    <div>
      <PageHeader
        title="Super-Admin Access"
        subtitle="Control whether VED platform support can sign in to your school to help with setup or troubleshooting."
      />

      <Card className="mt-16" style={{ borderLeft: '3px solid var(--info)' }}>
        <div className="flex gap-8" style={{ alignItems: 'center' }}>
          <Icon name="shield" />
          <span style={{ fontSize: 13 }} className="subtle">
            When enabled, a VED platform administrator can open a temporary, audited session inside your
            school. Every such login is recorded. Turn it off at any time — existing sessions end on expiry.
          </span>
        </div>
      </Card>

      <Card className="mt-16">
        {isLoading ? (
          <Spinner />
        ) : (
          <div className="flex gap-8" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontSize: 15, marginBottom: 4 }}>Allow platform Login-As</h3>
              <Badge tone={allowed ? 'success' : 'neutral'}>{allowed ? 'Enabled' : 'Disabled'}</Badge>
            </div>
            <Button variant={allowed ? 'ghost' : 'primary'} disabled={setAccess.isPending} onClick={toggle}>
              {setAccess.isPending ? 'Saving…' : allowed ? 'Disable access' : 'Enable access'}
            </Button>
          </div>
        )}
        {setAccess.error && (
          <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12 }}>{String(setAccess.error)}</p>
        )}
      </Card>
    </div>
  );
}
