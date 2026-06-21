import Modal from "../ui/Modal";
import Button from "../ui/Button";

/**
 * ConfirmDialog.tsx — FULL & FINAL
 *
 * Reusable confirm modal.
 * Use if you don't want window.confirm.
 */

type Props = {
  open: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "danger" | "primary" | "secondary";
  onConfirm: () => void;
  onClose: () => void;
};

export default function ConfirmDialog({
  open,
  title = "Confirm",
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  tone = "danger",
  onConfirm,
  onClose,
}: Props) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {cancelText}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : tone === "primary" ? "primary" : "secondary"}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmText}
          </Button>
        </div>
      }
    >
      <div className="text-sm text-gray-700">{message}</div>
    </Modal>
  );
}