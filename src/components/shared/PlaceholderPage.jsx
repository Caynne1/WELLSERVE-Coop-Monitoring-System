import { Construction } from 'lucide-react';

export default function PlaceholderPage({ title, description }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-6">
      <Construction size={48} className="text-gray-200 mb-4" />
      <h2 className="text-lg font-semibold text-gray-700">{title}</h2>
      <p className="text-sm text-gray-400 mt-1 max-w-xs">{description || 'This page is under construction.'}</p>
    </div>
  );
}
