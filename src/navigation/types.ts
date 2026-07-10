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
};

export type AppTabParamList = {
  Home: undefined;
  Centers: undefined;
  MyAppointments: undefined;
  Notifications: undefined;
  Profile: undefined;
};
