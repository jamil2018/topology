"use client";

import { Button, Modal, useOverlayState } from "@heroui/react";

export type ConfirmDialogProps = {
  state: ReturnType<typeof useOverlayState>;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  tone?: "default" | "danger";
  onConfirm: () => void;
  onCancel?: () => void;
};

export function ConfirmDialog({
  state,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  pending = false,
  tone = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal.Root state={state}>
      <Modal.Backdrop isDismissable={!pending}>
        <Modal.Container placement="center" size="sm">
          <Modal.Dialog className="outline-none">
            <Modal.Header className="flex flex-col gap-1 border-b border-[color:var(--topo-line)] px-4 py-3">
              <Modal.Heading className="text-base font-semibold text-[color:var(--topo-ink)]">
                {title}
              </Modal.Heading>
              {description ? (
                <p className="text-sm text-[color:var(--topo-muted)]">
                  {description}
                </p>
              ) : null}
            </Modal.Header>
            <Modal.Footer className="flex justify-end gap-2 px-4 py-3">
              <Button
                size="sm"
                variant="secondary"
                isDisabled={pending}
                onPress={() => {
                  onCancel?.();
                  state.close();
                }}
              >
                {cancelLabel}
              </Button>
              <Button
                size="sm"
                variant={tone === "danger" ? "danger" : "primary"}
                isDisabled={pending}
                onPress={onConfirm}
              >
                {pending ? "Working…" : confirmLabel}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}
