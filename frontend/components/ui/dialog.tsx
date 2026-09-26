import * as React from 'react';
import { Modal, ModalProps } from './modal';
import { cn } from '@/lib/utils';

export interface DialogProps extends ModalProps {
  footer?: React.ReactNode;
}

export const Dialog: React.FC<DialogProps> = ({ children, footer, ...props }) => {
  return (
    <Modal {...props}>
      <div className="space-y-4">
        <div>{children}</div>
        {footer && <div className="flex items-center justify-end space-x-2 pt-4 border-t border-border">{footer}</div>}
      </div>
    </Modal>
  );
};
