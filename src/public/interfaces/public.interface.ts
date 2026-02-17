export type TicketStatus =
  | 'PENDIENTE'
  | 'LLAMADO'
  | 'ATENDIENDO'
  | 'FINALIZADO'
  | 'CANCELADO';

export type DisplayTicketRow = {
  id: string;
  code: string;
  type: 'REGULAR' | 'PREFERENCIAL';
  status: TicketStatus;
  branchId: string;
  branchName: string;
  serviceId: string;
  serviceName: string;
  serviceCode: string;
  windowId: string | null;
  windowName: string | null;
  calledAt: Date | null;
  createdAt: Date;
};

export type PublicDisplayTicket = {
  id: string;
  code: string;
  type: 'REGULAR' | 'PREFERENCIAL';
  status: TicketStatus;
  branchId: string;
  branchName: string;
  serviceId: string;
  serviceName: string;
  serviceCode: string;
  windowId: string;
  windowName: string;
  calledAt: Date | null;
  createdAt: Date;
};
