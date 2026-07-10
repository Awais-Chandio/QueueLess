import { queueService } from '../../../services/queueService';
export const staffQueueService = queueService;
export type {
  StaffDashboardStats,
  StaffDashboardData,
  StaffDashboardScope,
} from '../../../services/queueService';
export { sortStaffQueueAppointments } from '../../../services/queueService';
