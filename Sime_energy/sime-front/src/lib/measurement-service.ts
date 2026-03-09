import { supabase } from '@/lib/supabase';
import { logActivity } from '@/lib/activity-service';

export interface AuditMeasurement {
  id: string;
  audit_id: string;
  building_id?: string;
  sensor_name: string;
  sensor_type: string;
  measurement_value?: number;
  unit?: string;
  recorded_at: string;
  recorded_by?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export async function getAuditMeasurements(auditId: string) {
  const { data, error } = await supabase
    .from('audit_measurements')
    .select('*')
    .eq('audit_id', auditId)
    .order('recorded_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createMeasurement(auditId: string, organizationId: string, measurement: Partial<AuditMeasurement>, userId: string) {
  const { data, error } = await supabase
    .from('audit_measurements')
    .insert([
      {
        audit_id: auditId,
        sensor_name: measurement.sensor_name,
        sensor_type: measurement.sensor_type,
        measurement_value: measurement.measurement_value,
        unit: measurement.unit,
        recorded_at: measurement.recorded_at || new Date().toISOString(),
        recorded_by: userId,
        notes: measurement.notes,
        building_id: measurement.building_id,
      },
    ])
    .select()
    .single();

  if (error) throw error;

  // Log activity for measurement recording
  try {
    await logActivity(
      auditId,
      organizationId,
      userId,
      'measurement_recorded',
      `Mesure enregistrée: ${measurement.sensor_name}`,
      `Mesure de ${measurement.sensor_name} (${measurement.sensor_type}) enregistrée: ${measurement.measurement_value} ${measurement.unit}.`,
      { measurement_id: data.id, sensor_name: measurement.sensor_name, value: measurement.measurement_value }
    );
  } catch (e) {
    console.warn('Error logging measurement activity:', e);
  }

  return data;
}

export async function updateMeasurement(measurementId: string, updates: Partial<AuditMeasurement>) {
  const { data, error } = await supabase
    .from('audit_measurements')
    .update({
      measurement_value: updates.measurement_value,
      unit: updates.unit,
      notes: updates.notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', measurementId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteMeasurement(measurementId: string) {
  const { error } = await supabase
    .from('audit_measurements')
    .delete()
    .eq('id', measurementId);

  if (error) throw error;
}

export async function getMeasurementStats(auditId: string) {
  const measurements = await getAuditMeasurements(auditId);

  // Count unique sensors
  const uniqueSensors = new Set(measurements.map(m => m.sensor_name));
  const totalSensors = uniqueSensors.size;
  const activeSensors = totalSensors; // In a real app, check if sensor has recent data

  return {
    totalSensors,
    activeSensors,
    measurementCount: measurements.length,
    lastMeasurementDate: measurements.length > 0 ? measurements[0].recorded_at : new Date().toISOString(),
  };
}
