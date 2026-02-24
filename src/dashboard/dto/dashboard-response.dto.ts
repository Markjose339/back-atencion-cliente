export type DashboardRangeInfo = {
  from: Date;
  to: Date;
  days: number;
};

export type DashboardSummaryKpis = {
  ticketsCreated: number;
  ticketsAttended: number;
  ticketsCancelled: number;
  queueNow: number;
  attendingNow: number;
  completionRatePct: number;
  cancellationRatePct: number;
  averageWaitMinutes: number;
  averageAttentionMinutes: number;
};

export type DashboardSummaryResponse = {
  range: DashboardRangeInfo;
  kpis: DashboardSummaryKpis;
};

export type DashboardAreaPoint = {
  date: string;
  created: number;
  attended: number;
  cancelled: number;
  completionRatePct: number;
};

export type DashboardAreaBranchGroup = {
  branchId: string;
  branchName: string;
  data: DashboardAreaPoint[];
};

export type DashboardAreaResponse = {
  range: DashboardRangeInfo;
  data: DashboardAreaBranchGroup[];
};

export type DashboardBranchPerformanceItem = {
  branchId: string;
  branchName: string;
  ticketsCreated: number;
  ticketsAttended: number;
  ticketsCancelled: number;
  completionRatePct: number;
  averageWaitMinutes: number;
  averageAttentionMinutes: number;
};

export type DashboardBranchPerformanceResponse = {
  range: DashboardRangeInfo;
  totals: {
    ticketsCreated: number;
    ticketsAttended: number;
    ticketsCancelled: number;
  };
  data: DashboardBranchPerformanceItem[];
};

export type DashboardWindowPerformanceItem = {
  windowId: string;
  windowName: string;
  windowCode: string;
  ticketsAttended: number;
  averageWaitMinutes: number;
  averageAttentionMinutes: number;
};

export type DashboardWindowPerformanceBranchGroup = {
  branchId: string;
  branchName: string;
  totalAttended: number;
  windows: DashboardWindowPerformanceItem[];
};

export type DashboardWindowPerformanceResponse = {
  range: DashboardRangeInfo;
  data: DashboardWindowPerformanceBranchGroup[];
};

export type DashboardServicePerformanceItem = {
  serviceId: string;
  serviceName: string;
  serviceCode: string;
  ticketsAttended: number;
  attendanceSharePct: number;
  averageWaitMinutes: number;
  averageAttentionMinutes: number;
};

export type DashboardServicePerformanceBranchGroup = {
  branchId: string;
  branchName: string;
  totalAttended: number;
  services: DashboardServicePerformanceItem[];
};

export type DashboardServicePerformanceResponse = {
  range: DashboardRangeInfo;
  data: DashboardServicePerformanceBranchGroup[];
};

export type DashboardPanelResponse = {
  summary: DashboardSummaryResponse;
  area: DashboardAreaResponse;
  branches: DashboardBranchPerformanceResponse;
  windows: DashboardWindowPerformanceResponse;
  services: DashboardServicePerformanceResponse;
};
