export interface DoctorMockData {
  nextSlot: string;
}

/**
 * Placeholder data for fields the backend does not provide yet.
 *
 * Ratings and reviews used to be generated here; they now come from
 * `doctor_reviews` (see `StarRating` and `reviewService`). `nextSlot` is still
 * a stand-in until a real next-available-slot query exists.
 */
export const getDoctorMockData = (doctorId: string): DoctorMockData => {
  let charCodeSum = 0;
  for (let i = 0; i < doctorId.length; i++) {
    charCodeSum += doctorId.charCodeAt(i);
  }

  const slotOptions = [
    '05:30 PM',
    '09:15 AM',
    '11:00 AM',
    '02:30 PM',
    '04:45 PM',
    '10:30 AM',
    '06:15 PM',
  ];

  return { nextSlot: slotOptions[charCodeSum % slotOptions.length] };
};
