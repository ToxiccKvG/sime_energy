import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  variant?: "default" | "warning" | "success";
}

export function KPICard({ title, value, subtitle, icon: Icon, trend, variant = "default" }: KPICardProps) {
  return (
    <Card className="overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <h3 className="mt-2 text-3xl font-semibold text-card-foreground">{value}</h3>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
            {trend && (
              <div className="mt-3 flex items-center gap-1">
                <span
                  className={cn(
                    "text-sm font-medium",
                    trend.isPositive ? "text-success" : "text-warning"
                  )}
                >
                  {trend.isPositive ? "↑" : "↓"} {trend.value}
                </span>
                <span className="text-xs text-muted-foreground">vs mois dernier</span>
              </div>
            )}
          </div>
          <div
            className={cn(
              "rounded-lg p-3",
              variant === "warning" && "bg-warning/10",
              variant === "success" && "bg-success/10",
              variant === "default" && "bg-primary/10"
            )}
          >
            <Icon
              className={cn(
                "h-6 w-6",
                variant === "warning" && "text-warning",
                variant === "success" && "text-success",
                variant === "default" && "text-primary"
              )}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
