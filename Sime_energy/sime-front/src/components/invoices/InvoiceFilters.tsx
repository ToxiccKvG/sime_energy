import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Search, Filter, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface InvoiceFiltersProps {
  statusFilters: string[];
  auditFilter: string;
  searchQuery: string;
  onStatusFiltersChange: (value: string[]) => void;
  onAuditFilterChange: (value: string) => void;
  onSearchChange: (value: string) => void;
}

const statusOptions = [
  { value: 'to_verify', label: 'À vérifier' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'verified', label: 'Vérifié' },
  { value: 'validated', label: 'Validé' },
];

export function InvoiceFilters({
  statusFilters,
  auditFilter,
  searchQuery,
  onStatusFiltersChange,
  onAuditFilterChange,
  onSearchChange,
}: InvoiceFiltersProps) {
  const handleStatusToggle = (status: string) => {
    if (statusFilters.includes(status)) {
      onStatusFiltersChange(statusFilters.filter(s => s !== status));
    } else {
      onStatusFiltersChange([...statusFilters, status]);
    }
  };

  const clearStatusFilters = () => {
    onStatusFiltersChange([]);
  };

  return (
    <div className="flex flex-wrap gap-4">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Rechercher une facture..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>
      
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="gap-2">
            <Filter className="h-4 w-4" />
            Statuts
            {statusFilters.length > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 h-5 text-xs">
                {statusFilters.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[220px] p-3" align="start">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Filtrer par statut</span>
              {statusFilters.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearStatusFilters}
                  className="h-6 px-2 text-xs"
                >
                  <X className="h-3 w-3 mr-1" />
                  Effacer
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {statusOptions.map((option) => (
                <div key={option.value} className="flex items-center gap-2">
                  <Checkbox
                    id={option.value}
                    checked={statusFilters.includes(option.value)}
                    onCheckedChange={() => handleStatusToggle(option.value)}
                  />
                  <label
                    htmlFor={option.value}
                    className="text-sm cursor-pointer flex-1"
                  >
                    {option.label}
                  </label>
                </div>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Select value={auditFilter} onValueChange={onAuditFilterChange}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Audit" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tous les audits</SelectItem>
          <SelectItem value="AUD001">Audit Site Principal 2025</SelectItem>
          <SelectItem value="AUD002">Audit Site Secondaire 2025</SelectItem>
          <SelectItem value="AUD003">Audit Tertiaire Q1</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
