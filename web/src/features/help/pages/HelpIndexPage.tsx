// Help home — every topic, grouped by area. Reached from the sidebar “Help” link or
// any “?” affordance.
import { Link } from 'react-router-dom';
import { PageHeader, Card } from '@/shared/ui';
import { HELP_TOPICS, type HelpTopic } from '../content';

const CATEGORY_ORDER: HelpTopic['category'][] = [
  'Getting started',
  'People',
  'Academics',
  'Finance',
  'Administration',
  'Platform',
];

export default function HelpIndexPage() {
  return (
    <div style={{ maxWidth: 760 }}>
      <PageHeader
        title="Help & guidance"
        subtitle="Short, practical guides for everyday tasks. Tip: the “?” next to any page title jumps straight to the right one."
      />
      {CATEGORY_ORDER.map((cat) => {
        const topics = HELP_TOPICS.filter((t) => t.category === cat);
        if (topics.length === 0) return null;
        return (
          <Card key={cat} className="mt-16">
            <div className="nav-group-label" style={{ padding: '0 0 10px' }}>{cat}</div>
            <div className="help-toc">
              {topics.map((t) => (
                <Link key={t.slug} to={`/help/${t.slug}`} className="help-toc-item">
                  <span className="t">{t.title}</span>
                  <span className="d">{t.summary}</span>
                </Link>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
