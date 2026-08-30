import { formatCurrency, formatDate } from '../../utils/formatters';

export default function LoanReleasePicker({ loans, value, onChange, disabled }) {
  if (!loans?.length) return null;
  const describe = loan => [
    `Net proceeds: ${formatCurrency(loan.net_proceeds)}`,
    `Principal: ${formatCurrency(loan.amount)}`,
    `Date: ${formatDate(loan.release_date || loan.created_at)}`,
  ].join(' | ');
  return (
    <div className="mb-4">
      <label htmlFor="check-release-loan" className="block text-sm font-medium text-gray-700 mb-1">Loan to Release</label>
      {loans.length === 1 ? (
        <p className="text-sm text-gray-600 break-words">{describe(loans[0])}</p>
      ) : (
        <select
          id="check-release-loan"
          value={value}
          onChange={event => onChange(event.target.value)}
          disabled={disabled}
          className="w-full min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="">Select by amount and date</option>
          {loans.map(loan => <option key={loan.id} value={loan.id}>
            {formatCurrency(loan.net_proceeds)} | {formatDate(loan.release_date || loan.created_at)}
          </option>)}
        </select>
      )}
    </div>
  );
}
