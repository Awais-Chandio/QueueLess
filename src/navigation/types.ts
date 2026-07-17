import type { NavigatorScreenParams } from '@react-navigation/native';

export type AppStackParamList = {
  MainTabs: NavigatorScreenParams<AppTabParamList> | undefined;
  CenterDetails: { centerId?: string };
  DoctorList: { centerId: string; serviceId: string; serviceName?: string };
  BookAppointment: { centerId?: string; serviceId?: string; doctorId?: string };
  AppointmentDetails: { appointmentId?: string };
  QueueStatus: {
    appointmentId?: string;
    doctorId?: string;
    centerId?: string;
    serviceId?: string;
  };
  EditProfile: undefined;
  Settings: undefined;
  PrivacyPolicy: undefined;
  About: undefined;
  Terms: undefined;
  Centers: undefined;
  SelectSlot: { doctorId: string; centerId: string; serviceId: string };
  PatientDetails: { lockId: string; doctorId: string; centerId: string; serviceId: string; selectedDate: string; slot: string; expiryTime: number };
  ConfirmBooking: { lockId: string; doctorId: string; centerId: string; serviceId: string; selectedDate: string; slot: string; notes: string; expiryTime: number; patientName?: string; patientPhone?: string };
  Receipt: { appointmentId: string };
  NearbyClinics: undefined;
  DoctorSearch: undefined;
  PublicDoctorProfile: { doctorId: string; centerId?: string; serviceId?: string };
  ClinicSelection: { doctorId: string };
};

export type AppTabParamList = {
  Home: undefined;
  Centers: undefined;
  MyAppointments: undefined;
  Notifications: undefined;
  Profile: undefined;
};
