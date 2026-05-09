import { Sparkles, Car, Palette, Wrench, Shirt, LogIn, LogOut, ShoppingCart, HelpCircle, LucideIcon } from "lucide-react";

export type TaskType = "cleaning" | "driving" | "decoration" | "maintenance" | "laundry" | "checkin" | "checkout" | "shopping" | "other";

export const TASK_TYPE_ICONS: Record<TaskType, LucideIcon> = {
  cleaning: Sparkles,
  driving: Car,
  decoration: Palette,
  maintenance: Wrench,
  laundry: Shirt,
  checkin: LogIn,
  checkout: LogOut,
  shopping: ShoppingCart,
  other: HelpCircle,
};

export const TASK_TYPE_COLORS: Record<TaskType, string> = {
  cleaning: "bg-blue-500",
  driving: "bg-amber-500",
  decoration: "bg-pink-500",
  maintenance: "bg-orange-500",
  laundry: "bg-cyan-500",
  checkin: "bg-emerald-500",
  checkout: "bg-violet-500",
  shopping: "bg-yellow-500",
  other: "bg-slate-500",
};

export const TASK_TYPES: TaskType[] = [
  "cleaning", "driving", "decoration", "maintenance", "laundry", "checkin", "checkout", "shopping", "other",
];
