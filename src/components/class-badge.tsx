import { GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** Marks what the teacher corrected or taught in a class (source "class"), as opposed to the app's own analysis. */
export function ClassBadge() {
  return (
    <Badge variant="secondary" className="gap-1">
      <GraduationCap className="size-3" />
      From class
    </Badge>
  );
}
