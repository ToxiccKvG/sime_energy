import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

interface InputFieldProps {
  label: string;
  field: string;
  value: any;
  onChange: (field: string, value: any) => void;
  type?: string;
}

export function InputField({ label, field, value, onChange, type = "text" }: InputFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={field}>{label}</Label>
      <Input
        id={field}
        type={type}
        value={value || ''}
        onChange={(e) => onChange(field, type === 'number' ? Number(e.target.value) : e.target.value)}
      />
    </div>
  );
}

interface TextareaFieldProps {
  label: string;
  field: string;
  value: any;
  onChange: (field: string, value: any) => void;
}

export function TextareaField({ label, field, value, onChange }: TextareaFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={field}>{label}</Label>
      <Textarea
        id={field}
        value={value || ''}
        onChange={(e) => onChange(field, e.target.value)}
        rows={3}
      />
    </div>
  );
}

interface YesNoFieldProps {
  label: string;
  field: string;
  value: boolean;
  onChange: (field: string, value: boolean) => void;
}

export function YesNoField({ label, field, value, onChange }: YesNoFieldProps) {
  return (
    <div className="flex items-center gap-4">
      <Label>{label} :</Label>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={value === true}
            onCheckedChange={() => onChange(field, true)}
          />
          <span>OUI</span>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            checked={value === false}
            onCheckedChange={() => onChange(field, false)}
          />
          <span>NON</span>
        </div>
      </div>
    </div>
  );
}
