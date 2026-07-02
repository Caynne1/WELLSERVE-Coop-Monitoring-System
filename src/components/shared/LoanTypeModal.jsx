import { useState } from 'react';
import { RotateCw, Sparkles } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

/**
 * LoanTypeModal — shown before opening LoanFormPage for a brand-new loan.
 *
 * The coop's approved interest rates can change over time. When that
 * happens, loans that were already ongoing before the change must keep
 * being computed at the rate that was in effect when they were released,
 * while loans booked from this point forward should use the newly
 * updated rate. This modal captures that distinction up front so
 * LoanFormPage can auto-select the correct rate for each loan product.
 */
export default function LoanTypeModal({ open, onClose, onContinue }) {
  const [selected, setSelected] = useState('new');

  function handleContinue() {
    onContinue(selected);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Select Loan Type" size="md">
      <p className="text-sm text-gray-500 mb-4">
        Choose whether this is an existing/ongoing loan being re-encoded, or a
        brand-new loan being released today. This determines which interest
        rate is applied.
      </p>

      <div className="space-y-3">
        <LoanTypeOption
          active={selected === 'existing'}
          icon={<RotateCw size={18} />}
          title="Existing / Ongoing Loan"
          description="Loan was already released under the coop's previous approved interest rate. Uses the previous interest rate."
          onClick={() => setSelected('existing')}
        />
        <LoanTypeOption
          active={selected === 'new'}
          icon={<Sparkles size={18} />}
          title="New Loan"
          description="A newly released loan booked under the coop's current, updated interest rate."
          onClick={() => setSelected('new')}
        />
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleContinue}>Continue</Button>
      </div>
    </Modal>
  );
}

function LoanTypeOption({ active, icon, title, description, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left p-4 rounded-xl border transition-colors flex items-start gap-3 ${
        active
          ? 'border-[#07A04E] bg-[#07A04E]/5 ring-1 ring-[#07A04E]'
          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      <div
        className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
          active ? 'bg-[#07A04E] text-white' : 'bg-gray-100 text-gray-500'
        }`}
      >
        {icon}
      </div>
      <div>
        <p className={`text-sm font-semibold ${active ? 'text-[#07A04E]' : 'text-gray-800'}`}>
          {title}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
    </button>
  );
}
