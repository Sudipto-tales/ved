// App Releases — the desktop & mobile build registry for the platform super-admin.
// List from GET /api/v1/platform/releases; create / publish / delete via the platformApi
// mutation hooks. The "new build" form is an inline panel (Card) shown conditionally.
// NOTE: binary upload isn't wired yet — the admin pastes a download URL (object store /
// release link). That honesty is surfaced in the form copy.
import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Field,
  Icon,
  PageHeader,
  SectionCard,
  Select,
  Spinner,
} from '@/shared/ui';
import {
  useCreateRelease,
  useDeleteRelease,
  usePublishRelease,
  useReleases,
  type Release,
  type ReleaseInput,
} from '../../shared/platformApi';

const PLATFORMS = ['ANDROID', 'IOS', 'WINDOWS', 'MACOS', 'LINUX', 'WEB'] as const;
const CHANNELS = ['stable', 'beta', 'alpha'] as const;

const FORM_GRID = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } as const;

const EMPTY_INPUT: ReleaseInput = {
  platform: 'ANDROID',
  channel: 'stable',
  version: '',
  file_name: '',
  download_url: '',
  notes: '',
  published: false,
};

function ReleaseForm({ onClose }: { onClose: () => void }) {
  const create = useCreateRelease();
  const [draft, setDraft] = useState<ReleaseInput>(EMPTY_INPUT);
  const pending = create.isPending;
  const error = create.error;

  function patch<K extends keyof ReleaseInput>(key: K, value: ReleaseInput[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function submit() {
    const body: ReleaseInput = {
      platform: draft.platform,
      channel: draft.channel,
      version: draft.version.trim(),
      file_name: draft.file_name?.trim() || undefined,
      download_url: draft.download_url?.trim() || undefined,
      notes: draft.notes?.trim() || undefined,
      published: draft.published,
    };
    create.mutate(body, { onSuccess: () => onClose() });
  }

  return (
    <Card className="mt-16" style={{ borderColor: 'var(--accent)' }}>
      <h3 style={{ fontSize: 15, marginBottom: 4 }}>New build</h3>
      <p className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
        Paste the build's download URL (object store / release link). Direct file upload is coming soon.
      </p>
      <div className="mt-16" style={FORM_GRID}>
        <Field label="Platform">
          <Select value={draft.platform} onChange={(e) => patch('platform', e.target.value)}>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Channel">
          <Select value={draft.channel} onChange={(e) => patch('channel', e.target.value)}>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Version">
          <input className="input" value={draft.version} placeholder="1.0.0" onChange={(e) => patch('version', e.target.value)} />
        </Field>
        <Field label="File name" hint="Optional, e.g. ved-1.0.0-windows-x64.exe">
          <input className="input" value={draft.file_name ?? ''} onChange={(e) => patch('file_name', e.target.value)} />
        </Field>
        <Field label="Download URL">
          <input
            className="input"
            value={draft.download_url ?? ''}
            placeholder="https://releases.ved.app/…"
            onChange={(e) => patch('download_url', e.target.value)}
          />
        </Field>
        <Field label="Notes">
          <textarea
            className="input"
            rows={3}
            value={draft.notes ?? ''}
            placeholder="Release notes / changelog"
            onChange={(e) => patch('notes', e.target.value)}
          />
        </Field>
      </div>
      <label className="flex gap-8 mt-16" style={{ alignItems: 'center', fontSize: 13 }}>
        <input
          type="checkbox"
          checked={draft.published ?? false}
          onChange={(e) => patch('published', e.target.checked)}
        />
        Published
      </label>
      {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12 }}>{String(error)}</p>}
      <div className="flex gap-8 mt-16">
        <Button disabled={pending || !draft.version.trim()} onClick={submit}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

export default function ReleasesPage() {
  const { data, isLoading, error } = useReleases();
  const publish = usePublishRelease();
  const remove = useDeleteRelease();
  const [showForm, setShowForm] = useState(false);
  const rows = data?.releases ?? [];

  function togglePublish(r: Release) {
    publish.mutate({ id: r.id, published: !r.published });
  }

  function onDelete(r: Release) {
    if (window.confirm(`Delete the ${r.platform} ${r.channel} ${r.version} build? This cannot be undone.`)) {
      remove.mutate(r.id);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader title="App Releases" subtitle="Publish desktop & mobile builds" />
      {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
      {publish.error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(publish.error)}</p>}
      {remove.error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{String(remove.error)}</p>}

      {showForm && <ReleaseForm onClose={() => setShowForm(false)} />}

      <SectionCard
        icon="graduation"
        title="Builds"
        tone="violet"
        right={
          <Button onClick={() => setShowForm(true)}>
            <span className="flex gap-8" style={{ alignItems: 'center' }}>
              <Icon name="graduation" size={15} /> New build
            </span>
          </Button>
        }
      >
        {isLoading ? (
          <Spinner />
        ) : (
          <DataTable<Release>
            rows={rows}
            rowKey={(r) => r.id}
            searchable
            searchText={(r) => `${r.platform} ${r.channel} ${r.version} ${r.notes ?? ''}`}
            empty={
              <EmptyState
                icon={<Icon name="graduation" />}
                title="No builds"
                desc="No app builds have been registered yet. Add your first build."
              />
            }
            columns={[
              { header: 'Platform', cell: (r) => <Badge tone="info">{r.platform}</Badge> },
              { header: 'Channel', cell: (r) => r.channel },
              { header: 'Version', cell: (r) => <span style={{ fontWeight: 600 }}>{r.version}</span> },
              {
                header: 'Download',
                cell: (r) =>
                  r.download_url ? (
                    <button
                      type="button"
                      className="icon-btn"
                      title="Download"
                      aria-label="Download"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (r.download_url) window.open(r.download_url, '_blank', 'noopener');
                      }}
                    >
                      <Icon name="download" />
                    </button>
                  ) : (
                    <span className="muted">—</span>
                  ),
              },
              {
                header: 'Published',
                cell: (r) => (
                  <span className="flex gap-8" style={{ alignItems: 'center' }}>
                    <Badge tone={r.published ? 'success' : 'neutral'}>{r.published ? 'Published' : 'Draft'}</Badge>
                    <button
                      type="button"
                      className="icon-btn"
                      title={r.published ? 'Unpublish' : 'Publish'}
                      aria-label={r.published ? 'Unpublish' : 'Publish'}
                      disabled={publish.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePublish(r);
                      }}
                    >
                      <Icon name={r.published ? 'pause' : 'check'} />
                    </button>
                  </span>
                ),
              },
              {
                header: '',
                align: 'right',
                cell: (r) => (
                  <span className="flex gap-8" style={{ justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Delete"
                      aria-label="Delete"
                      disabled={remove.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(r);
                      }}
                    >
                      <Icon name="trash" />
                    </button>
                  </span>
                ),
              },
            ]}
          />
        )}
      </SectionCard>
    </div>
  );
}
