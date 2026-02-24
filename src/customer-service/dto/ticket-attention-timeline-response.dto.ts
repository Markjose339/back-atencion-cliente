import { PaginationMeta } from '@/pagination/interfaces/pagination.interface';

export type TicketStatus =
  | 'PENDIENTE'
  | 'LLAMADO'
  | 'ATENDIENDO'
  | 'ESPERA'
  | 'FINALIZADO'
  | 'CANCELADO';

export type TicketDurationMetric = {
  milliseconds: number;
  seconds: number;
  minutes: number;
};

export type TicketAttentionTimelineListItem = {
  id: string;
  code: string;
  packageCode: string | null;
  type: 'REGULAR' | 'PREFERENCIAL';
  status: TicketStatus;
  branchId: string;
  branchName: string;
  serviceId: string;
  serviceName: string;
  userId: string | null;
  userName: string | null;
  calledAt: Date | null;
  attentionStartedAt: Date | null;
  attentionFinishedAt: Date | null;
  createdAt: Date;
  fromCreatedToAttention: TicketDurationMetric | null;
  fromAttentionStartToFinish: TicketDurationMetric | null;
};

export type TicketAttentionTimelineListResponse = {
  data: TicketAttentionTimelineListItem[];
  meta: PaginationMeta;
};
