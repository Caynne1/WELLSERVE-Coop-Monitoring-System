import Modal from '../ui/Modal';
import { MemberFormContent } from '../../pages/members/MemberFormPage';

export default function AddMemberModal({ open, onClose, onCreated }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add New Member"
      size="xl"
    >
      <MemberFormContent
        inModal
        onClose={onClose}
        onCreated={onCreated}
      />
    </Modal>
  );
} 