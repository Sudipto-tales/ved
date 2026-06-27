// A single help topic, rendered from the content registry. Unknown slugs show a
// friendly not-found with a link back to the help home.
import { Link, useParams } from 'react-router-dom';
import { Card, Icon, PageHeader } from '@/shared/ui';
import { getTopic, type Block } from '../content';

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case 'p':
      return <p>{block.text}</p>;
    case 'h':
      return <h3>{block.text}</h3>;
    case 'ul':
      return <ul>{block.items.map((i, n) => <li key={n}>{i}</li>)}</ul>;
    case 'ol':
      return <ol>{block.items.map((i, n) => <li key={n}>{i}</li>)}</ol>;
    case 'tip':
      return <div className="tip">{block.text}</div>;
  }
}

export default function HelpTopicPage() {
  const { slug } = useParams<{ slug: string }>();
  const topic = getTopic(slug);

  if (!topic) {
    return (
      <div>
        <PageHeader title="Help topic not found" />
        <Card>
          <p className="muted">We couldn’t find that help topic.</p>
          <Link to="/help" className="btn btn-secondary mt-16">Browse all help</Link>
        </Card>
      </div>
    );
  }

  const related = (topic.related ?? []).map(getTopic).filter(Boolean);

  return (
    <div>
      <Link to="/help" className="help-back">
        <Icon name="arrow-left" size={15} /> All help
      </Link>
      <PageHeader title={topic.title} subtitle={topic.summary} />
      <Card>
        <div className="help-prose">
          {topic.blocks.map((b, n) => <BlockView key={n} block={b} />)}
        </div>
      </Card>

      {related.length > 0 && (
        <Card className="mt-16">
          <div className="nav-group-label" style={{ padding: '0 0 10px' }}>Related</div>
          <div className="help-toc">
            {related.map((t) => (
              <Link key={t!.slug} to={`/help/${t!.slug}`} className="help-toc-item">
                <span className="t">{t!.title}</span>
                <span className="d">{t!.summary}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
