export type AppStackParamList = {
  MainTabs: undefined;
  CenterDetails: { centerId?: string };
  BookAppointment: { centerId?: string; serviceId?: string };
  AppointmentDetails: { appointmentId?: string };
  QueueStatus: {
    appointmentId: string;
  };
  EditProfile: undefined;
  Settings: undefined;
};

export type AppTabParamList = {
  Home: undefined;
  Centers: undefined;
  MyAppointments: undefined;
  Notifications: undefined;
  Profile: undefined;
};
