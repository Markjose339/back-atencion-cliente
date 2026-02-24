import { PaginationMeta } from '@/pagination/interfaces/pagination.interface';

export type CustomerServiceCalledTicket = {
  id: string;
  code: string;
  type: 'REGULAR' | 'PREFERENCIAL';
  status: 'LLAMADO';
  branchId: string;
  serviceId: string;
  userId: string | null;
  branchWindowServiceId: string | null;
  calledAt: Date | null;
  createdAt: Date;
};

export type CustomerServiceQueueTicket = {
  id: string;
  code: string;
  packageCode: string | null;
  type: 'REGULAR' | 'PREFERENCIAL';
  status:
    | 'PENDIENTE'
    | 'LLAMADO'
    | 'ATENDIENDO'
    | 'ESPERA'
    | 'FINALIZADO'
    | 'CANCELADO';
  branchId: string;
  serviceId: string;
  calledAt: Date | null;
  attentionStartedAt: Date | null;
  attentionFinishedAt: Date | null;
  createdAt: Date;
};

export type CustomerServiceQueueResponse = {
  data: CustomerServiceQueueTicket[];
  heldTickets: CustomerServiceQueueTicket[];
  meta: PaginationMeta;
  isAttendingTicket: boolean;
  calledTicket: CustomerServiceCalledTicket | null;
};
