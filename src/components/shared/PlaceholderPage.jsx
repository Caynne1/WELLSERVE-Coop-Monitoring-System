import EmptyState from '../ui/EmptyState';
import { Construction } from 'lucide-react';

export default function PlaceholderPage({ title, description }) {
  return (
    <div className="page-shell">
      <EmptyState icon={Construction} title={title} description={description || 'This page is under construction.'} />
    </div>
  );
}