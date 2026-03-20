import { useState, useEffect } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import { getStaff, deleteStaff } from '../../services/staffService';
import { formatDate } from '../../utils/formatters';

export default function StaffPage() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toDelete, setToDelete] = useState(null);

  useEffect(() => {
    getStaff().then(setStaff).catch(() => toast.error('Failed to load staff')).finally(() => setLoading(false));
  }, []);

  async function handleDelete() {
    try { await deleteStaff(toDelete.id); toast.success('Staff removed'); setStaff(p => p.filter(s => s.id !== toDelete.id)); setToDelete(null); }
    catch { toast.error('Failed to delete'); }
  }

  return (
    <div className="p-6">
      <PageHeader title="Staff Management" subtitle="Manage system users and access"
        action={<Button icon={<Plus size={15} />}>Add Staff</Button>} />
      {loading ? <div className="flex justify-center py-20"><Spinner /></div> : (
        <div className="mt-5 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Name', 'Email', 'Role', 'Joined', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {staff.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-12 text-gray-400">
                    <Users size={32} className="mx-auto mb-2 text-gray-200" />No staff yet.
                  </td></tr>
                ) : staff.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-900">{s.full_name || s.name || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{s.email}</td>
                    <td className="px-4 py-3 capitalize text-gray-500">{s.role || '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(s.created_at)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => setToDelete(s)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={handleDelete}
        title="Remove Staff" message="Remove this staff member from the system?" />
    </div>
  );
}
