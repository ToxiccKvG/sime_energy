import { supabase } from '@/lib/supabase';
import { logActivity } from '@/lib/activity-service';

export interface AuditTask {
  id: string;
  audit_id: string;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'done' | 'cancelled';
  priority: 'low' | 'medium' | 'high';
  assigned_to?: string;
  assigned_to_name?: string;
  due_date?: string;
  created_by: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export async function getAuditTasks(auditId: string) {
  const { data, error } = await supabase
    .from('audit_tasks')
    .select('*')
    .eq('audit_id', auditId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createTask(auditId: string, organizationId: string, task: Partial<AuditTask>, userId: string) {
  const { data, error } = await supabase
    .from('audit_tasks')
    .insert([
      {
        audit_id: auditId,
        title: task.title,
        description: task.description,
        status: task.status || 'todo',
        priority: task.priority || 'medium',
        assigned_to: task.assigned_to,
        due_date: task.due_date,
        created_by: userId,
      },
    ])
    .select()
    .single();

  if (error) throw error;

  // Log activity for task creation
  try {
    await logActivity(
      auditId,
      organizationId,
      userId,
      'task_created',
      `Tâche créée: ${task.title}`,
      `Nouvelle tâche créée: ${task.description || task.title}`,
      { task_id: data.id, title: task.title, priority: task.priority }
    );
  } catch (e) {
    console.warn('Error logging task creation activity:', e);
  }

  return data;
}

export async function updateTask(taskId: string, updates: Partial<AuditTask>, auditId?: string, organizationId?: string, userId?: string) {
  const updateData: any = {
    title: updates.title,
    description: updates.description,
    status: updates.status,
    priority: updates.priority,
    assigned_to: updates.assigned_to,
    due_date: updates.due_date,
    updated_at: new Date().toISOString(),
  };

  // If status is being changed to 'done', set completed_at
  if (updates.status === 'done') {
    updateData.completed_at = new Date().toISOString();
  } else if (updates.status !== 'done' && updates.status !== undefined) {
    updateData.completed_at = null;
  }

  const { data, error } = await supabase
    .from('audit_tasks')
    .update(updateData)
    .eq('id', taskId)
    .select()
    .single();

  if (error) throw error;

  // Log activity if status changed to 'done'
  if (updates.status === 'done' && auditId && organizationId && userId) {
    try {
      await logActivity(
        auditId,
        organizationId,
        userId,
        'task_completed',
        `Tâche complétée: ${data.title}`,
        `Tâche ${data.title} marquée comme complétée.`,
        { task_id: taskId, title: data.title }
      );
    } catch (e) {
      console.warn('Error logging task completion activity:', e);
    }
  }

  return data;
}

export async function deleteTask(taskId: string) {
  const { error } = await supabase
    .from('audit_tasks')
    .delete()
    .eq('id', taskId);

  if (error) throw error;
}

export async function getTaskStats(auditId: string) {
  const tasks = await getAuditTasks(auditId);

  const todoCount = tasks.filter(t => t.status === 'todo').length;
  const inProgressCount = tasks.filter(t => t.status === 'in_progress').length;
  const doneCount = tasks.filter(t => t.status === 'done').length;

  return {
    total: tasks.length,
    todo: todoCount,
    inProgress: inProgressCount,
    done: doneCount,
    completed: doneCount,
  };
}
