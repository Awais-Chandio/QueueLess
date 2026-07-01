export interface QueueSnapshot {
  currentToken: number;
  nextToken?: number | null;
  yourToken?: number | null;
  peopleAhead: number;
  estimatedWaitMins: number;
  currentPosition: number;
  averageConsultationTime?: number | null;
  isOnBreak?: boolean;
  breakStart?: string | null;
  breakEnd?: string | null;
  queueStatus?: string | null;
}
