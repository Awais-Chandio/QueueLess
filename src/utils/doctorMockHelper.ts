export interface DoctorMockReview {
  id: string;
  userName: string;
  rating: number;
  date: string;
  comment: string;
}

export interface DoctorMockData {
  rating: number;
  reviewsCount: number;
  nextSlot: string;
  reviews: DoctorMockReview[];
}

export const getDoctorMockData = (doctorId: string): DoctorMockData => {
  let charCodeSum = 0;
  for (let i = 0; i < doctorId.length; i++) {
    charCodeSum += doctorId.charCodeAt(i);
  }

  // Consistent rating between 4.4 and 4.9
  const rating = parseFloat((4.4 + (charCodeSum % 6) * 0.1).toFixed(1));
  const reviewsCount = 15 + (charCodeSum % 120);

  // Next slot options
  const slotOptions = [
    '05:30 PM',
    '09:15 AM',
    '11:00 AM',
    '02:30 PM',
    '04:45 PM',
    '10:30 AM',
    '06:15 PM'
  ];
  const nextSlot = slotOptions[charCodeSum % slotOptions.length];

  const reviewComments = [
    'Excellent diagnostic skills. Took time to explain everything in detail.',
    'Very caring and professional. The slot lock worked perfectly!',
    'Explains the treatment plan thoroughly. Highly recommended.',
    'Excellent experience. Saved me hours of waiting in the clinic.',
    'Very experienced and patient-focused specialist.',
    'Punctual and highly professional consultation.',
  ];

  const userNames = [
    'Ali Khan',
    'Fatima Zahra',
    'Zainab Bibi',
    'Muhammad Ahmed',
    'Sana Malik',
    'Ayesha Umar',
  ];

  const reviews = Array.from({ length: 3 }, (_, idx) => {
    const userIndex = (charCodeSum + idx) % userNames.length;
    const commentIndex = (charCodeSum + idx) % reviewComments.length;
    const revRating = Math.min(5, Math.max(4, 5 - ((charCodeSum + idx) % 2)));
    return {
      id: `${doctorId}-review-${idx}`,
      userName: userNames[userIndex],
      rating: revRating,
      date: `July ${10 + idx}, 2026`,
      comment: reviewComments[commentIndex],
    };
  });

  return {
    rating,
    reviewsCount,
    nextSlot,
    reviews,
  };
};
