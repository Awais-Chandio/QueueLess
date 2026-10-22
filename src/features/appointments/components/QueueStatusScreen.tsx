import React from 'react';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { EmptyState } from '../../../components/ui/EmptyState';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import type { AppStackParamList } from '../../../navigation/types';
import { AppointmentQueueStatus } from './queue-status/AppointmentQueueStatus';
import { DoctorQueuePreview } from './queue-status/DoctorQueuePreview';

/**
 * Two modes: a patient's own appointment (appointmentId), or a doctor's live
 * queue before booking (doctorId, marketplace).
 */
const QueueStatusScreen = () => {
  const { params } = useRoute<RouteProp<AppStackParamList, 'QueueStatus'>>();

  if (params?.doctorId) {
    return <DoctorQueuePreview doctorId={params.doctorId} centerId={params.centerId} serviceId={params.serviceId} />;
  }
  if (params?.appointmentId) {
    return <AppointmentQueueStatus appointmentId={params.appointmentId} />;
  }
  return (
    <ScreenWrapper>
      <EmptyState title="Appointment Not Found" subtitle="Unable to load queue status." />
    </ScreenWrapper>
  );
};

export default QueueStatusScreen;
