import Modal from '../ui/Modal';
import Button from '../ui/Button';

/**
 * ConfirmDialog — reusable confirmation modal.
 *
 * Props:
 *  open          bool
 *  title         string
 *  message       string | ReactNode
 *  confirmLabel  string   (default: 'Confirm')
 *  confirmVariant string  (default: 'danger') — any Button variant
 *  loading       bool
 *  onConfirm     () => void
 *  onCancel      () => void   (alias: onClose — either works)
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  confirmVariant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
  // legacy alias — some callers still pass onClose
  onClose,
}) {
  const handleCancel = onCancel ?? onClose ?? (() => {});

  return (
    <Modal open={open} onClose={handleCancel} title={title || 'Confirm'} size="sm">
      <p className="text-sm text-gray-600 mb-6">{message || 'Are you sure?'}</p>
      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={handleCancel}
          disabled={loading}
          type="button"
        >
          Cancel
        </Button>
        <Button
          variant={confirmVariant}
          onClick={onConfirm}
          loading={loading}
          type="button"
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
