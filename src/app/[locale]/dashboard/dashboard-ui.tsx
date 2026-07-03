import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * A shell panel for the Phase 2 dashboards: routing and guards are real, the
 * features land in later phases. `comingSoon` labels the empty state.
 */
export function PlaceholderPanel({
  title,
  description,
  comingSoon,
}: {
  title: string;
  description: string;
  comingSoon: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Badge variant="muted">{comingSoon}</Badge>
      </CardContent>
    </Card>
  );
}
