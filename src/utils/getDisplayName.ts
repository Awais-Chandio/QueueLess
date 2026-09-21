export const getDisplayName = (profile: any) => {
  if (!profile) return "User";

  // full_name priority
  if (profile.full_name && !profile.full_name.includes("@")) {
    return profile.full_name;
  }

  // fallback safe
  return "User";
};
