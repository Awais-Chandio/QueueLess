export type AppStackParamList = {
  MainTabs: undefined;
  CenterDetails: { centerId?: string };
  BookAppointment: { centerId?: string; serviceId?: string };
  BookingDetails: { bookingId?: string };
  QueueStatus: { bookingId?: string };
  EditProfile: undefined;
};

export type AppTabParamList = {
  Home: undefined;
  Centers: undefined;
  MyBookings: undefined;
  Profile: undefined;
  Settings: undefined;
};
