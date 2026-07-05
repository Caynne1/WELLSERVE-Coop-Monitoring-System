import { useState, useEffect, useRef } from 'react';
import { Search, User } from 'lucide-react';
import { searchMembers } from '../../services/memberService';

export default function MemberSearchInput({ value, onChange, placeholder = 'Search member...' }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!query || query.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const data = await searchMembers(query).catch(() => []);
      setResults(data);
      setOpen(true);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={placeholder}
          className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-20 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
          {results.map(m => (
            <button
              key={m.id}
              onClick={() => { onChange(m); setQuery(`${m.first_name} ${m.last_name}`); setOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-gray-50 text-left"
            >
              <User size={14} className="text-gray-400 flex-shrink-0" />
              <span className="whitespace-normal break-words leading-snug">{m.first_name} {m.last_name}</span>
              {m.member_no && <span className="text-xs text-gray-400 ml-auto font-mono flex-shrink-0">{m.member_no}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}