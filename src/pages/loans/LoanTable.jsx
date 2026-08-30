import { useEffect, useId, useRef, useState } from 'react';
import { MoreHorizontal, Eye, Pencil, ArrowRight, Check, Trash2, ArrowUpDown, ChevronUp, ChevronDown, CreditCard } from 'lucide-react';
import Badge from '../../components/ui/Badge';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { getLoanFinancials, getLoanDueState, normalizeLoanStatus, getLoanTypeLabel, getLoanRecordDate } from '../../utils/loanListState';

const COLUMNS = [
  { key: 'member', label: 'Member', width: '14%', align: 'left' },
  { key: 'loan_type', label: 'Loan Type', width: '8%', align: 'left' },
  { key: 'amount', label: 'Principal', width: '9%', align: 'right' },
  { key: 'interest', label: 'Interest', width: '9%', align: 'right' },
  { key: 'payable', label: 'Total Payable', width: '9%', align: 'right' },
  { key: 'paid', label: 'Amount Paid', width: '9%', align: 'right' },
  { key: 'balance', label: 'Balance', width: '9%', align: 'right' },
  { key: 'due_date', label: 'Due Date', width: '10%', align: 'center' },
  { key: 'status', label: 'Status', width: '10%', align: 'center' },
  { key: null, label: 'Actions', width: '13%', align: 'center' },
];

const STATUS_LABELS = { credit_committee_approval: 'For Approval', draft: 'Draft', approved: 'Approved',
  released: 'Released', active: 'Active', paid: 'Paid', delinquent: 'Delinquent', rejected: 'Rejected', cancelled: 'Cancelled' };
const STATUS_VARIANTS = { credit_committee_approval: 'warning', approved: 'success', released: 'info',
  active: 'success', paid: 'success', delinquent: 'danger', rejected: 'danger' };

function LoanStatus({ loan }) {
  const status = normalizeLoanStatus(loan.status);
  return (
    <div className="flex flex-col items-start gap-1.5 xl:items-center">
      <Badge variant={STATUS_VARIANTS[status] || 'default'} className="max-w-full text-center leading-4">
        {STATUS_LABELS[status] || status}
      </Badge>
    </div>
  );
}

function LoanIdentity({ loan }) {
  const recordDate = getLoanRecordDate(loan);
  return (
    <div className="min-w-0">
      <p className="font-semibold text-gray-900 leading-5 [overflow-wrap:anywhere]">
        {[ loan.members?.first_name, loan.members?.last_name].filter(Boolean).join(' ') || 'Unknown member'}
      </p>
      <p className="mt-1 text-xs text-gray-500 [overflow-wrap:anywhere]">
        {loan.members?.member_no || 'No member number'}
      </p>
      {recordDate && (
        <p className="mt-1 text-[11px] leading-4 text-gray-500">
          {recordDate.label}: <span className="inline-block whitespace-nowrap">{formatDate(recordDate.date)}</span>
        </p>
      )}
    </div>
  );
}

function LoanDueDate({ loan }) {
  const due = getLoanDueState(loan);
  return (
    <div className="flex flex-col gap-1 xl:items-center">
      <span>{due.dueDate ? formatDate(due.dueDate) : '-'}</span>
      {due.diffDays !== null && due.diffDays <= 0 && (
        <span className={`text-[11px] ${due.diffDays < 0 ? 'text-red-700' : 'text-amber-700'}`}>
          {due.diffDays < 0 ? 'Overdue' : 'Due today'}
        </span>
      )}
    </div>
  );
}

function MoreLoanActions({ onDelete, disabled }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const deleteRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    deleteRef.current?.focus();
    const closeOutside = event => {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative"
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          setOpen(false);
          triggerRef.current?.focus();
        } else if (open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          deleteRef.current?.focus();
        }
      }}>
      <button ref={triggerRef} type="button" title="More actions" aria-label="More actions"
        aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        disabled={disabled} onClick={() => setOpen(value => !value)}
        onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }}
        className="inline-flex h-10 w-10 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-600 disabled:opacity-40 xl:h-8 xl:w-7">
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label="More loan actions"
          className="absolute right-0 top-full z-30 mt-1 w-36 rounded-md border border-gray-200 bg-white p-1 shadow-lg">
          <button ref={deleteRef} type="button" role="menuitem" disabled={disabled}
            onClick={() => { setOpen(false); onDelete(); }}
            className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 focus:bg-red-50 focus:outline-none">
            <Trash2 size={15} aria-hidden="true" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

function ActionButton({ label, icon: Icon, onClick, disabled, tone = 'text-gray-500 hover:text-blue-700 hover:bg-blue-50' }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 disabled:opacity-40 disabled:cursor-not-allowed xl:h-8 xl:w-7 ${tone}`}>
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}

function LoanActions({ loan, canEdit, canApprove, canDelete, savingId, onView, onEdit, onWorkflow, onDelete }) {
  const status = normalizeLoanStatus(loan.status);
  const busy = savingId === loan.id;
  return (
    <div role="group" aria-label="Loan actions" className="flex flex-wrap items-center gap-1 xl:justify-center">
      <ActionButton label="View" icon={Eye} onClick={() => onView(loan)} />
      {canEdit && <ActionButton label="Edit" icon={Pencil} onClick={() => onEdit(loan)} disabled={busy} />}
      {status === 'draft' && canEdit && (
        <ActionButton label="Submit for Approval" icon={ArrowRight} onClick={() => onWorkflow(loan)}
          disabled={busy} tone="text-green-700 hover:bg-green-50" />
      )}
      {status === 'credit_committee_approval' && canApprove && (
        <ActionButton label="Approve" icon={Check} onClick={() => onWorkflow(loan)}
          disabled={busy} tone="text-green-700 hover:bg-green-50" />
      )}
      {canDelete && <MoreLoanActions onDelete={() => onDelete(loan)} disabled={busy} />}
    </div>
  );
}

export default function LoanTable({ loans, sortConfig, onSort, emptyMessage, ...actions }) {
  if (!loans.length) return (
    <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
      <CreditCard size={32} className="text-gray-300" />
      <p className="text-sm">{emptyMessage}</p>
    </div>
  );

  return (
    <>
      <table className="hidden w-full table-fixed text-xs xl:table" aria-label="Member loans">
        <colgroup>{COLUMNS.map(col => <col key={col.label} style={{ width: col.width }} />)}</colgroup>
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            {COLUMNS.map(col => {
              const sorted = col.key && sortConfig.key === col.key;
              const SortIcon = !sorted ? ArrowUpDown : sortConfig.direction === 'asc' ? ChevronUp : ChevronDown;
              return (
                <th key={col.label} scope="col" aria-sort={!sorted ? undefined : sortConfig.direction === 'asc' ? 'ascending' : 'descending'}
                  className={`px-2 py-4 text-xs font-semibold normal-case leading-4 text-gray-500 ${col.align === 'right' ? 'text-right' : col.align === 'left' ? 'text-left' : 'text-center'} ${col.key === 'member' ? 'pl-4' : ''}`}>
                  {col.key ? (
                    <button type="button" onClick={() => onSort(col.key)}
                      className={`flex w-full items-center gap-1 text-xs font-semibold normal-case leading-4 hover:text-gray-900 ${col.align === 'right' ? 'justify-end text-right' : col.align === 'left' ? 'justify-start text-left' : 'justify-center text-center'}`}>
                      {col.align === 'right' && <SortIcon size={11} className="shrink-0" />}
                      <span>{col.label}</span>
                      {col.align !== 'right' && <SortIcon size={11} className="shrink-0" />}
                    </button>
                  ) : <span className="text-xs font-semibold normal-case leading-4">{col.label}</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {loans.map(loan => {
            const values = getLoanFinancials(loan);
            return (
              <tr key={loan.id} className="hover:bg-green-50/40">
                <td className="py-4 pl-4 pr-2 align-middle"><LoanIdentity loan={loan} /></td>
                <td className="px-2 py-4 text-left align-middle leading-5">{getLoanTypeLabel(loan)}</td>
                {['amount', 'interest', 'payable', 'paid', 'balance'].map(key => (
                  <td key={key} className={`px-2 py-4 text-right align-middle tabular-nums leading-5 [overflow-wrap:anywhere] ${key === 'balance' ? (values.balance > 0 ? 'font-semibold text-orange-700' : 'font-semibold text-green-700') : key === 'paid' ? 'text-green-700' : 'text-gray-900'}`}>
                    {formatCurrency(values[key])}
                  </td>
                ))}
                <td className="px-2 py-4 align-middle text-center leading-5"><LoanDueDate loan={loan} /></td>
                <td className="px-2 py-4 align-middle"><LoanStatus loan={loan} /></td>
                <td className="px-2 py-3 align-middle"><LoanActions loan={loan} {...actions} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="xl:hidden">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
          <label htmlFor="loan-mobile-sort" className="text-xs text-gray-500">Sort by</label>
          <select id="loan-mobile-sort" value={sortConfig.key || ''} onChange={e => onSort(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 py-2 text-xs">
            <option value="">Most recent</option>
            {COLUMNS.filter(col => col.key).map(col => <option key={col.key} value={col.key}>{col.label}</option>)}
          </select>
          <ActionButton label="Reverse sort order" icon={sortConfig.direction === 'asc' ? ChevronUp : ChevronDown}
            disabled={!sortConfig.key} onClick={() => onSort(sortConfig.key)} />
        </div>
        <div className="divide-y divide-gray-200">
          {loans.map(loan => {
            const values = getLoanFinancials(loan);
            return (
              <article key={loan.id} className="px-4 py-5">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <LoanIdentity loan={loan} /><LoanStatus loan={loan} />
                </div>
                <p className="mt-2 text-xs text-gray-600">{getLoanTypeLabel(loan)}</p>
                <dl className="mt-4 grid grid-cols-[repeat(2,minmax(0,1fr))] gap-x-6 gap-y-3">
                  {COLUMNS.filter(col => ['amount', 'interest', 'payable', 'paid', 'balance'].includes(col.key)).map(col => (
                    <div key={col.key} className="min-w-0">
                      <dt className="text-xs text-gray-500">{col.label}</dt>
                      <dd className={`mt-1 text-sm font-semibold tabular-nums [overflow-wrap:anywhere] ${col.key === 'balance' ? (values.balance > 0 ? 'text-orange-700' : 'text-green-700') : 'text-gray-900'}`}>{formatCurrency(values[col.key])}</dd>
                    </div>
                  ))}
                  <div className="min-w-0">
                    <dt className="text-xs text-gray-500">Due Date</dt>
                    <dd className="mt-1 text-sm font-semibold text-gray-900"><LoanDueDate loan={loan} /></dd>
                  </div>
                </dl>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
                  <span className="text-xs text-gray-500">Actions</span>
                  <LoanActions loan={loan} {...actions} />
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </>
  );
}
