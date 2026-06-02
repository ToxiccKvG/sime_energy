import { useSearchParams } from 'react-router-dom';
import { MeasurementWorkflow } from '@/components/mesures/MeasurementWorkflow';

const Mesures = () => {
  const [searchParams] = useSearchParams();
  const auditId = searchParams.get('auditId') || undefined;

  return (
    <div className="space-y-6">
      <MeasurementWorkflow auditId={auditId} />
    </div>
  );
};

export default Mesures;
