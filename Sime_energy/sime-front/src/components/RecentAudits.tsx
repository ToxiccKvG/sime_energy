import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

const audits = [
  {
    id: 1,
    name: "Audit Énergétique Site Principal",
    organization: "TechCorp Industries",
    status: "En cours",
    date: "2025-11-10",
    completion: 65,
  },
  {
    id: 2,
    name: "Analyse Consommation Q4 2024",
    organization: "Green Energy Solutions",
    status: "Terminé",
    date: "2025-11-05",
    completion: 100,
  },
  {
    id: 3,
    name: "Audit Réglementaire Bâtiment B",
    organization: "Manufacturing Plus",
    status: "En attente",
    date: "2025-11-01",
    completion: 0,
  },
];

const statusVariant = {
  "En cours": "default" as const,
  "Terminé": "outline" as const,
  "En attente": "secondary" as const,
};

export function RecentAudits() {
  const navigate = useNavigate();

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Audits récents</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {audits.map((audit) => (
            <div
              key={audit.id}
              onClick={() => navigate(`/audits/${audit.id}`)}
              className="flex items-start gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50 cursor-pointer"
            >
              <div className="rounded-lg bg-primary/10 p-2">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{audit.name}</p>
                    <p className="text-sm text-muted-foreground">{audit.organization}</p>
                  </div>
                  <Badge variant={statusVariant[audit.status as keyof typeof statusVariant]}>
                    {audit.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{new Date(audit.date).toLocaleDateString("fr-FR")}</span>
                  {audit.completion > 0 && <span>{audit.completion}% complété</span>}
                </div>
              </div>
              <Button variant="ghost" size="icon">
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
