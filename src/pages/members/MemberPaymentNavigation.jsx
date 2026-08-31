import { createContext, useContext, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { findPaymentInvoices } from '../../utils/memberPaymentHistory';

const PaymentNavigation = createContext(null);

export function MemberPaymentNavigation({ memberId, children }) {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const busy = useRef(false);
  const [selection, setSelection] = useState(null);

  function openInvoice(invoice) {
    setSelection(null);
    navigate(`/invoices?invoice=${encodeURIComponent(invoice.id)}`);
  }

  async function openPayment(row) {
    if (!hasPermission('invoices', 'view')) {
      toast.error('You do not have permission to view invoices.');
      return;
    }
    if (busy.current) return;
    busy.current = true;
    try {
      if (row.is_stored_payment) {
        toast.error('This imported summary has no individual invoice link.');
        return;
      }
      const invoices = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from('invoices')
          .select('id, invoice_no, member_id, date, payment_date, amount, purpose, payment_type, ref_id, account_id, status')
          .eq('member_id', memberId).order('id').range(offset, offset + 999);
        if (error) throw error;
        invoices.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      const { exact, candidates } = findPaymentInvoices(row, invoices, memberId);
      if (exact.length === 1) openInvoice(exact[0]);
      else if (exact.length || candidates.length) {
        setSelection({ invoices: exact.length ? exact : candidates, exact: exact.length > 0 });
      } else toast.error('No linked invoice was found for this payment.');
    } catch (error) {
      console.error('[MemberPaymentNavigation]', error);
      toast.error('Could not load the payment invoice. Please try again.');
    } finally {
      busy.current = false;
    }
  }

  return (
    <PaymentNavigation.Provider value={openPayment}>
      {children}
      <Modal open={!!selection} onClose={() => setSelection(null)} title="Payment Invoice" size="lg">
        <p className="mb-3 text-sm text-gray-500">
          {selection?.exact ? 'More than one invoice uses this reference. Select the correct record.' :
            'This payment has no verified invoice link. These invoices share its payment date; select only the matching record.'}
        </p>
        <div className="divide-y divide-gray-100">
          {selection?.invoices.map(invoice => (
            <button key={invoice.id} type="button" onClick={() => openInvoice(invoice)}
              className="flex w-full items-center gap-3 py-3 text-left text-sm hover:bg-gray-50 focus-visible:outline-green-600">
              <Eye size={16} className="shrink-0 text-green-700" />
              <span className="min-w-0 flex-1 break-words">
                <span className="block font-medium">{invoice.invoice_no || 'Without SI number'}</span>
                <span className="text-xs text-gray-500">{formatDate(invoice.payment_date || invoice.date)} | {invoice.purpose || ''} | {invoice.status}</span>
              </span>
              <span className="shrink-0 font-semibold">{formatCurrency(invoice.amount)}</span>
            </button>
          ))}
        </div>
      </Modal>
    </PaymentNavigation.Provider>
  );
}

export function PaymentHistoryRow({ record, children, className = '' }) {
  const openPayment = useContext(PaymentNavigation);
  return (
    <tr tabIndex={0} title="View payment invoice" aria-label="View payment invoice"
      onClick={() => openPayment?.(record)}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openPayment?.(record);
        }
      }}
      className={`cursor-pointer hover:bg-emerald-50/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-600 ${className}`}>
      {children}
    </tr>
  );
}
