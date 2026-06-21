import type { NavigatorScreenParams } from '@react-navigation/native';

export type AppStackParamList = {
  MainTabs: NavigatorScreenParams<AppTabParamList> | undefined;
  CenterDetails: { centerId?: string };
  BookAppointment: { centerId?: string; serviceId?: string };
  AppointmentDetails: { appointmentId?: string };
  QueueStatus: {
    appointmentId: string;
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
