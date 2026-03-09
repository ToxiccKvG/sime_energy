import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Plus, Activity } from "lucide-react";

export function QuickActions() {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Actions rapides</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button variant="outline" className="w-full justify-start gap-3">
          <Upload className="h-4 w-4" />
          Importer une facture
        </Button>
        <Button variant="outline" className="w-full justify-start gap-3">
          <Activity className="h-4 w-4" />
          Ajouter une mesure
        </Button>
        <Button className="w-full justify-start gap-3">
          <Plus className="h-4 w-4" />
          Créer un audit
        </Button>
      </CardContent>
    </Card>
  );
}
