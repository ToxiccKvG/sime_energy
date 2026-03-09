import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Users, FolderOpen, BarChart3, Package } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface AuditQuickActionsProps {
  onCreateAction: () => void;
  auditId: string;
}

export function AuditQuickActions({ onCreateAction, auditId }: AuditQuickActionsProps) {
  const navigate = useNavigate();

  const handleCreateInvoiceGroup = () => {
    toast.success('Groupe de factures SENELEC créé');
    navigate('/facturation', { state: { auditId, newGroup: true } });
  };

  const handleCreateMeasureGroup = () => {
    toast.success('Groupe de mesures créé');
    navigate('/mesures', { state: { auditId, newGroup: true } });
  };

  const handleCreateInventoryGroup = () => {
    toast.success('Groupe d\'inventaire créé');
    navigate('/inventaire', { state: { auditId, newGroup: true } });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Actions rapides</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button 
          variant="outline" 
          className="w-full justify-start gap-2" 
          size="sm"
          onClick={onCreateAction}
        >
          <FileText className="h-4 w-4" />
          Ajouter action terrain
        </Button>
        <Button 
          variant="outline" 
          className="w-full justify-start gap-2" 
          size="sm"
          onClick={onCreateAction}
        >
          <Users className="h-4 w-4" />
          Assigner tâche
        </Button>
        <Button 
          variant="outline" 
          className="w-full justify-start gap-2" 
          size="sm"
          onClick={handleCreateInvoiceGroup}
        >
          <FolderOpen className="h-4 w-4" />
          Créer groupe factures SENELEC
        </Button>
        <Button 
          variant="outline" 
          className="w-full justify-start gap-2" 
          size="sm"
          onClick={handleCreateMeasureGroup}
        >
          <BarChart3 className="h-4 w-4" />
          Créer groupe mesures
        </Button>
        <Button 
          variant="outline" 
          className="w-full justify-start gap-2" 
          size="sm"
          onClick={handleCreateInventoryGroup}
        >
          <Package className="h-4 w-4" />
          Créer groupe inventaire
        </Button>
      </CardContent>
    </Card>
  );
}
