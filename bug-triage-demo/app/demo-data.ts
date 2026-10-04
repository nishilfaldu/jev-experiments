export const buckets = ["Fix now", "This sprint", "Backlog"] as const;
export type Bucket = (typeof buckets)[number];
export type Ticket = { id: string; title: string; source: string; customer: string; context: string };
export const tickets: Ticket[] = [
  { id: "FIT-1044", title: "Members unable to book classes on iOS", source: "Support", customer: "Pulse Collective", context: "Members receive an error at the final booking step on iOS. The customer says class reservations are a primary reason members use the app." },
  { id: "FIT-1045", title: "Membership renewals failing for expired cards", source: "Support", customer: "Elevate Fitness", context: "Members cannot update expired cards during renewal. Several renewals have failed this week." },
  { id: "FIT-1046", title: "Front-desk check-in crashes during peak hours", source: "Crash report", customer: "Atlas Clubs", context: "The front-desk web app crashes while staff check in members during morning peak hours." },
  { id: "FIT-1047", title: "Trainer schedule edits fail on Android", source: "QA", customer: "FLEX Training", context: "Trainer schedule changes made on Android appear to save but revert when the page reloads." },
  { id: "FIT-1048", title: "Workout history takes eight seconds to load", source: "Support", customer: "Form Athletics", context: "Members wait about eight seconds for workout history to load in the mobile app. The data eventually appears." },
  { id: "FIT-1049", title: "Profile photo crop slightly incorrect", source: "App review", customer: "Movement Studio", context: "Profile photos are cropped a few pixels off center on iOS. Upload and display still work." },
  { id: "FIT-1050", title: "Recurring classes shift after daylight saving", source: "Support", customer: "Tempo Studios", context: "Recurring class times move by one hour after daylight saving changes, confusing instructors and members." },
  { id: "FIT-1051", title: "Corporate attendance export misses members", source: "Customer Success", customer: "Northstar Wellness", context: "A corporate customer's attendance CSV omits some members. The customer relies on it for monthly reporting and has asked for an urgent fix." },
];
export const workflows = {
  "Class booking": "Reserving, cancelling, and managing classes",
  Payments: "Payments, cards, and membership renewals",
  "Check-in": "Front-desk and member arrival workflows",
  Scheduling: "Trainer and recurring class schedules",
  "Workout history": "Viewing past workouts and activity",
  Membership: "Member accounts, status, and attendance",
  Cosmetic: "Visual details without functional impact",
} as const;
export const issueTypes = {
  Billing: "Payments, charges, cards, invoices, or renewals",
  Usability: "A confusing or difficult interaction where the underlying feature works",
  Accessibility: "A barrier for users with disabilities or assistive technology",
  Privacy: "Exposure, misuse, or incorrect access to personal information",
  Performance: "Slow response, loading, or resource use",
  Outage: "A service or major feature is unavailable to many users",
  "Functional bug": "A specific feature fails or produces an incorrect result",
  Visual: "Appearance or layout is incorrect without blocking a task",
} as const;
export const repositories = {
  "mobile-ios": "iOS app behavior and presentation",
  "mobile-android": "Android app behavior and presentation",
  "web-app": "Browser and front-desk interface",
  "backend-api": "Core API, attendance, and data handling",
  "billing-service": "Payment methods, charges, and renewals",
  "scheduling-service": "Recurring schedules and time calculations",
} as const;
export type ChoiceResult = { choice: string; probabilities: Record<string, number>; confidence: number };
export type Evaluation = { issueType: ChoiceResult; workflow: ChoiceResult; repository: ChoiceResult; core: number; churn: number; severity: number; bucket: Bucket; model: string };
