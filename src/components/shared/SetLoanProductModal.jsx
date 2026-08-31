import { useState } from 'react';
import { Save } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { assignLoanProduct } from '../../services/loanProductService';
import { LOAN_PRODUCT_FILTER_OPTIONS } from '../../utils/loanProducts';

export default function SetLoanProductModal({ loan, onClose, onSaved }) {
  const { hasPermission } = useAuth();
  const [product, setProduct] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    if (!hasPermission('loans', 'edit')) { setError('You do not have permission to set loan products.'); return; }
    setSaving(true);
    setError('');
    try {
      const result = await assignLoanProduct(loan.id, product);
      onSaved(result.loan);
      if (result.auditRecorded) toast.success('Loan product assigned.');
      else toast('Product saved, but the activity log could not be recorded. Assignment details remain in the loan record.', { duration: 7000 });
      onClose();
    } catch (err) {
      setError(err.message || 'Could not set the loan product.');
    } finally { setSaving(false); }
  }
  return <Modal open onClose={() => { if (!saving) onClose(); }} title="Set Loan Product" size="sm">
    <form onSubmit={submit}>
      <p className="mb-4 text-sm font-medium text-gray-700">{[loan.members?.first_name, loan.members?.last_name].filter(Boolean).join(' ') || loan.loan_no}</p>
      <label htmlFor="assigned-loan-product" className="mb-1.5 block text-sm font-medium text-gray-700">Loan Product</label>
      <select id="assigned-loan-product" autoFocus required disabled={saving} value={product}
        onChange={event => setProduct(event.target.value)}
        className="w-full min-w-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600">
        <option value="" disabled>Select loan product</option>
        {LOAN_PRODUCT_FILTER_OPTIONS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={!product} loading={saving} icon={<Save size={14} />}>Save</Button>
      </div>
    </form>
  </Modal>;
}
