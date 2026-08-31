import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { PaymentHistoryRow } from '../../pages/members/MemberPaymentNavigation';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { loanPaymentMode, loanPaymentSiNumber, paymentDate } from '../../utils/memberPaymentHistory';

const columns = ['Payment Date', 'SI#', 'Principal Paid', 'Interest Paid', 'Total Paid', 'Mode', 'Assisted By'];
const amounts = ['loan_amount', 'interest_amount', 'total_paid'];

export default function LoanPaymentHistoryTable({ rows, loans = [], memberId }) {
  const [invoices, setInvoices] = useState([]);
  const [referenceError, setReferenceError] = useState(false);
  useEffect(() => {
    let active = true;
    setInvoices([]);
    setReferenceError(false);
    const ids = [...new Set(rows.flatMap(row => [row.invoice_id, row.reference])
      .filter(value => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(value || ''))))];
    async function loadReferences() {
      const result = [];
      for (let offset = 0; offset < ids.length; offset += 100) {
        const { data, error } = await supabase.from('invoices').select('id, invoice_no, member_id')
          .eq('member_id', memberId).in('id', ids.slice(offset, offset + 100));
        if (error) throw error;
        result.push(...(data || []));
      }
      if (active) setInvoices(result);
    }
    if (memberId && ids.length) loadReferences().catch(() => { if (active) setReferenceError(true); });
    return () => { active = false; };
  }, [rows, memberId]);

  return (
    <div className="w-full overflow-x-auto">
      {referenceError && <p role="status" className="px-4 py-2 text-xs text-amber-700">Some SI numbers could not be loaded. Refresh to retry.</p>}
      <table className="w-full text-sm">
        <thead><tr className="border-b border-gray-100 bg-gray-50">
          {columns.map((label, index) => <th key={label} scope="col"
            className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 ${index >= 2 && index <= 4 ? 'text-right' : 'text-left'}`}>{label}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map(row => <PaymentHistoryRow key={row.id} record={row}>
            <td className="whitespace-nowrap px-4 py-3">{paymentDate(row) ? formatDate(paymentDate(row)) : ''}</td>
            <td className="px-4 py-3 text-gray-500">{loanPaymentSiNumber(row, invoices, loans)}</td>
            {amounts.map(key => <td key={key} className={`whitespace-nowrap px-4 py-3 text-right tabular-nums ${key === 'total_paid' ? 'font-semibold text-emerald-700' : 'font-medium'}`}>
              {formatCurrency(row[key] || 0)}
            </td>)}
            <td className="px-4 py-3 text-gray-500">{loanPaymentMode(row)}</td>
            <td className="px-4 py-3 text-gray-500">{row.created_by_name || ''}</td>
          </PaymentHistoryRow>)}
        </tbody>
        {rows.length > 0 && <tfoot><tr className="border-t border-gray-100 bg-gray-50">
          <td colSpan={2} className="px-4 py-3 text-xs font-semibold text-gray-600">Total Paid</td>
          {amounts.map(key => <td key={key} className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">
            {formatCurrency(rows.reduce((sum, row) => sum + Number(row[key] || 0), 0))}
          </td>)}
          <td colSpan={2} />
        </tr></tfoot>}
      </table>
    </div>
  );
}
