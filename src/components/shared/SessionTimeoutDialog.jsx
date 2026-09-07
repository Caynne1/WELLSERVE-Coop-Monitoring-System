import { Clock3, LogOut } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

export default function SessionTimeoutDialog({ open, remainingSeconds, onContinue, onLogout }) {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const countdown = `${minutes}:${String(seconds).padStart(2, '0')}`;

  return (
    <Modal open={open} onClose={onContinue} title="Session Expiring" size="sm">
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <Clock3 size={24} />
        </div>
        <p className="mt-4 text-sm text-gray-600">
          You have been inactive. For your security, you will be logged out in
          <span className="ml-1 font-semibold text-gray-900">{countdown}</span>.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button type="button" variant="outline" icon={<LogOut size={15} />} onClick={onLogout}>
            Log Out
          </Button>
          <Button type="button" variant="primary" onClick={onContinue}>
            Stay Logged In
          </Button>
        </div>
      </div>
    </Modal>
  );
}
