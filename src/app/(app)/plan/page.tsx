import { redirect } from "next/navigation";
import { startOfWeek, format } from "date-fns";

export default function PlanPage() {
  // Calculate current week's Monday
  const today = new Date();
  const monday = startOfWeek(today, { weekStartsOn: 1 });
  const weekStart = format(monday, "yyyy-MM-dd");

  redirect(`/plan/${weekStart}`);
}
