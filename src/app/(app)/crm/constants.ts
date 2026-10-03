export const ORG_TYPES = ["SCHOOL", "COLLEGE", "UNIVERSITY", "CORPORATE", "GOVERNMENT", "NGO", "PARTNER", "OTHER"] as const;
export const LEAD_SOURCES = ["WEBSITE", "REFERRAL", "WALK_IN", "PHONE", "EMAIL", "SOCIAL", "EVENT", "OTHER"] as const;
export const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED"] as const;
export const DEAL_STAGES = ["PROSPECT", "DEMO", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const;
export const OPEN_STAGES = ["PROSPECT", "DEMO", "PROPOSAL", "NEGOTIATION"] as const;
export const ACTIVITY_TYPES = ["CALL", "MEETING", "VISIT", "EMAIL", "TASK", "NOTE"] as const;

export const KERALA_DISTRICTS = [
  "Thiruvananthapuram",
  "Kollam",
  "Pathanamthitta",
  "Alappuzha",
  "Kottayam",
  "Idukki",
  "Ernakulam",
  "Thrissur",
  "Palakkad",
  "Malappuram",
  "Kozhikode",
  "Wayanad",
  "Kannur",
  "Kasaragod",
] as const;

export const leadStatusColor = {
  NEW: "blue",
  CONTACTED: "purple",
  QUALIFIED: "green",
  UNQUALIFIED: "gray",
  CONVERTED: "green",
} as const;

export const dealStageColor = {
  PROSPECT: "gray",
  DEMO: "blue",
  PROPOSAL: "purple",
  NEGOTIATION: "amber",
  WON: "green",
  LOST: "red",
} as const;

/** Edubotics offerings, used as suggestions on leads and deals. */
export const PROGRAMS = [
  "Classroom STEM programme (Grades 1-8)",
  "Engineering workshop (College)",
  "Professional workshop",
  "Teacher training",
  "Robotics & coding kits",
  "IoT learning kits",
  "Robotics lab setup",
  "Holiday camp",
] as const;
