import { useState } from 'react';
import { Plus, Pencil, Trash2, Loader2, Layers, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { updateLevel, deleteLevel, createRoom } from '@/lib/inventory-service';
import { logActivity } from '@/lib/activity-service';
import { NIVEAU_OPTIONS, FUNCTIONAL_TYPES } from '@/types/inventory';
import type { TreeData } from '@/pages/Inventaire';
import { Field, NumInput, TextInput } from './fields';

// ─── LEVEL VIEW ──────────────────────────────────────────────────────────────

export function LevelView({
  levelId,
  buildingId,
  treeData,
  auditId,
  orgId,
  userId,
  onRefreshRooms,
  onRefreshLevels,
}: {
  levelId: string;
  buildingId: string;
  treeData: TreeData;
  auditId: string;
  orgId: string;
  userId: string;
  onRefreshRooms: (levelId: string) => Promise<void>;
  onRefreshLevels: (buildingId: string) => Promise<void>;
}) {
  const level = (treeData.levels[buildingId] ?? []).find(l => l.id === levelId);
  const rooms = treeData.rooms[levelId] ?? [];
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [roomForm, setRoomForm] = useState({ code: '', service: '', surfaceM2: '', typeFonctionnel: '' });
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: level?.name ?? '',
    orderIndex: String(level?.orderIndex ?? 0),
  });

  if (!level) return null;

  const handleAddRoom = async () => {
    if (!roomForm.code.trim()) {
      toast.error('Le code de pièce est requis');
      return;
    }
    setSaving(true);
    try {
      await createRoom(auditId, levelId, {
        code: roomForm.code,
        service: roomForm.service || undefined,
        surfaceM2: roomForm.surfaceM2 ? parseFloat(roomForm.surfaceM2) : undefined,
        typeFonctionnel: roomForm.typeFonctionnel || undefined,
      });
      await onRefreshRooms(levelId);
      await logActivity(
        auditId,
        orgId,
        userId,
        'custom',
        'Pièce ajoutée',
        `${roomForm.code} ajoutée à l'étage ${level.name}`
      );
      toast.success('Pièce créée');
      setRoomForm({ code: '', service: '', surfaceM2: '', typeFonctionnel: '' });
      setShowAdd(false);
    } catch (err: any) {
      toast.error(err.message || 'Erreur création pièce');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateLevel = async () => {
    setSaving(true);
    try {
      await updateLevel(levelId, {
        name: editForm.name,
        orderIndex: parseInt(editForm.orderIndex || '0'),
      });
      await onRefreshLevels(buildingId);
      toast.success('Étage mis à jour');
      setEditOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Erreur mise à jour');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLevel = async () => {
    try {
      await deleteLevel(levelId);
      await onRefreshLevels(buildingId);
      toast.success('Étage supprimé');
    } catch (err: any) {
      toast.error(err.message || 'Erreur suppression');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Level header */}
      <div className="bg-[#1a1d2e] border border-slate-700/50 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-violet-500/15">
            <Layers className="w-5 h-5 text-violet-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-slate-100">Étage {level.name}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {rooms.length} pièce{rooms.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditOpen(true)}
              className="h-7 w-7 p-0 text-slate-400 hover:text-slate-100"
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDeleteOpen(true)}
              className="h-7 w-7 p-0 text-slate-400 hover:text-red-400"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Rooms list */}
      <div className="bg-[#1a1d2e] border border-slate-700/50 rounded-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-amber-400" />
            Pièces
          </h3>
          <Button
            size="sm"
            onClick={() => setShowAdd(true)}
            className="h-7 text-xs bg-amber-600 hover:bg-amber-500 text-white"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Ajouter
          </Button>
        </div>

        <div>
          <div className="p-4 space-y-2">
            {rooms.map(room => (
              <div
                key={room.id}
                className="flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-800/40 border border-slate-700/30"
              >
                <LayoutGrid className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono font-medium text-slate-200">{room.code}</p>
                  {room.service && (
                    <p className="text-xs text-slate-500">{room.service}</p>
                  )}
                </div>
                {room.surfaceM2 && (
                  <span className="text-xs text-slate-500">{room.surfaceM2} m²</span>
                )}
              </div>
            ))}
            {rooms.length === 0 && (
              <div className="text-center py-8 text-slate-500 text-sm">
                <LayoutGrid className="w-6 h-6 mx-auto mb-2 opacity-30" />
                Aucune pièce — ajoutez-en une
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add room dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="bg-[#1a1d2e] border-slate-700 text-slate-100 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Nouvelle pièce</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field label="Code pièce *" hint="ex: A1P1, BUR-01, LABO-3">
              <TextInput
                value={roomForm.code}
                onChange={v => setRoomForm(f => ({ ...f, code: v }))}
                placeholder="ex: A1P1"
              />
            </Field>
            <Field label="Service / Affectation">
              <TextInput
                value={roomForm.service}
                onChange={v => setRoomForm(f => ({ ...f, service: v }))}
                placeholder="ex: Comptabilité, Réception…"
              />
            </Field>
            <Field label="Surface (m²)">
              <NumInput
                value={roomForm.surfaceM2}
                onChange={v => setRoomForm(f => ({ ...f, surfaceM2: v }))}
                placeholder="0"
              />
            </Field>
            <Field label="Type fonctionnel" hint="Permet le calcul automatique des heures de fonctionnement">
              <Select
                value={roomForm.typeFonctionnel}
                onValueChange={v => setRoomForm(f => ({ ...f, typeFonctionnel: v }))}
              >
                <SelectTrigger className="bg-slate-800/60 border-slate-600 text-slate-100">
                  <SelectValue placeholder="Sélectionner…" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1d2e] border-slate-700">
                  {FUNCTIONAL_TYPES.map(t => (
                    <SelectItem key={t} value={t} className="text-slate-100 focus:bg-slate-700/50">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAdd(false)} className="text-slate-400">
              Annuler
            </Button>
            <Button
              onClick={handleAddRoom}
              disabled={saving}
              className="bg-amber-600 hover:bg-amber-500 text-white"
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit level dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-[#1a1d2e] border-slate-700 text-slate-100 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Modifier l'étage</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field label="Niveau">
              <Select
                value={editForm.name}
                onValueChange={v => setEditForm(f => ({ ...f, name: v }))}
              >
                <SelectTrigger className="bg-slate-800/60 border-slate-600 text-slate-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1d2e] border-slate-700">
                  {NIVEAU_OPTIONS.map(n => (
                    <SelectItem key={n} value={n} className="text-slate-100 focus:bg-slate-700/50">
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)} className="text-slate-400">
              Annuler
            </Button>
            <Button
              onClick={handleUpdateLevel}
              disabled={saving}
              className="bg-violet-600 hover:bg-violet-500 text-white"
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="bg-[#1a1d2e] border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">Supprimer cet étage ?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Toutes les pièces et équipements de cet étage seront supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-600 text-slate-300">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteLevel}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
