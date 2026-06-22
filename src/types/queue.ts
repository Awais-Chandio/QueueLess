export interface QueueSnapshot {
  currentToken: number;
  peopleAhead: number;
  estimatedWaitMins: number;
  currentPosition: number;
}
