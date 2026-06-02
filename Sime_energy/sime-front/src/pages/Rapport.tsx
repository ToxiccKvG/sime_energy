import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, Save, Sparkles, ArrowLeft, FileBarChart2, FileDown, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getAudit, updateAudit } from '@/lib/audit-service';
import { analyzeAuditWithAI } from '@/services/deepseekService';
import { toast } from 'sonner';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle,
} from 'docx';

interface SynthesisData {
  observations_generales: string;
  inventaire: string;
  mesures: string;
  facturation: string;
  recommandations: string;
  conclusions: string;
}

const defaultSynthesis: SynthesisData = {
  observations_generales: '',
  inventaire: '',
  mesures: '',
  facturation: '',
  recommandations: '',
  conclusions: '',
};

const sections: { key: keyof SynthesisData; label: string; placeholder: string }[] = [
  {
    key: 'observations_generales',
    label: 'Observations générales',
    placeholder: "Décrivez les constats généraux de l'audit énergétique…",
  },
  {
    key: 'inventaire',
    label: 'Inventaire énergétique',
    placeholder: "Résumez les résultats de l'inventaire — équipements, puissance installée, consommation estimée…",
  },
  {
    key: 'mesures',
    label: 'Mesures & campagnes',
    placeholder: "Résumez les données de mesures collectées — qualité réseau, relevés terrain, anomalies détectées…",
  },
  {
    key: 'facturation',
    label: 'Analyse de facturation',
    placeholder: "Résumez l'analyse des factures SENELEC — évolution des coûts, pointes de consommation, anomalies…",
  },
  {
    key: 'recommandations',
    label: 'Recommandations & préconisations',
    placeholder: "Listez les actions à mettre en oeuvre pour améliorer l'efficacité énergétique — par ordre de priorité…",
  },
  {
    key: 'conclusions',
    label: 'Conclusions',
    placeholder: "Rédigez la conclusion de l'audit — bilan global, gains potentiels, prochaines étapes…",
  },
];

// ─── Export helpers ──────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportTxt(auditName: string, synthesis: SynthesisData) {
  const date = new Date().toLocaleDateString('fr-FR');
  const lines: string[] = [
    `RAPPORT DE SYNTHÈSE ÉNERGÉTIQUE`,
    `Projet : ${auditName}`,
    `Date d'export : ${date}`,
    `${'─'.repeat(60)}`,
    '',
  ];
  for (const sec of sections) {
    lines.push(`## ${sec.label.toUpperCase()}`);
    lines.push('');
    lines.push(synthesis[sec.key] || '(non renseigné)');
    lines.push('');
    lines.push('─'.repeat(60));
    lines.push('');
  }
  lines.push(`CER2E — Rapport généré le ${date}`);
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  triggerDownload(blob, `rapport-${auditName.replace(/\s+/g, '-')}.txt`);
}

async function exportDocx(auditName: string, synthesis: SynthesisData) {
  const date = new Date().toLocaleDateString('fr-FR');

  const children: Paragraph[] = [
    new Paragraph({
      text: 'RAPPORT DE SYNTHÈSE ÉNERGÉTIQUE',
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Projet : ', bold: true }),
        new TextRun({ text: auditName }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Date d'export : ${date}`, color: '888888', size: 20 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
    }),
  ];

  for (const sec of sections) {
    children.push(
      new Paragraph({
        text: sec.label,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 4, color: '2563EB', space: 4 },
        },
      })
    );

    const content = synthesis[sec.key] || '(non renseigné)';
    for (const line of content.split('\n')) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: line, size: 22 })],
          spacing: { after: 120 },
        })
      );
    }
  }

  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: `CER2E — Rapport généré le ${date}`, color: '888888', size: 18 }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 800 },
    })
  );

  const doc = new Document({
    creator: 'SIMEE — CER2E',
    title: `Rapport de synthèse — ${auditName}`,
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `rapport-${auditName.replace(/\s+/g, '-')}.docx`);
}

// ─── Component ────────────────────────────────────────────────────────────────

const Rapport = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const auditId = searchParams.get('auditId') || '';

  const [auditName, setAuditName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState('');
  const [synthesis, setSynthesis] = useState<SynthesisData>(defaultSynthesis);

  useEffect(() => {
    if (!auditId) {
      setLoading(false);
      return;
    }
    getAudit(auditId)
      .then((data) => {
        if (data) {
          setAuditName(data.name);
          const saved = data.general_info?.synthesis;
          if (saved && typeof saved === 'object') {
            setSynthesis({ ...defaultSynthesis, ...saved });
          }
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [auditId]);

  const handleAnalyze = async () => {
    if (!auditId) return;
    setAnalyzing(true);
    setAnalysisProgress('Initialisation…');
    try {
      const result = await analyzeAuditWithAI(auditId, (msg) => setAnalysisProgress(msg));
      setSynthesis(result);
      toast.success('Analyse IA terminée — vérifiez et ajustez le rapport');
    } catch (err: any) {
      toast.error(err?.message ?? 'Erreur lors de l\'analyse IA');
    } finally {
      setAnalyzing(false);
      setAnalysisProgress('');
    }
  };

  const handleSave = async () => {
    if (!auditId) return;
    setSaving(true);
    try {
      const current = await getAudit(auditId);
      await updateAudit(auditId, {
        generalInfo: { ...(current?.general_info || {}), synthesis },
      });
      toast.success('Rapport sauvegardé');
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleExportTxt = () => {
    if (!auditId) return;
    exportTxt(auditName || auditId, synthesis);
    toast.success('Export TXT téléchargé');
  };

  const handleExportDocx = async () => {
    if (!auditId) return;
    setExporting(true);
    try {
      await exportDocx(auditName || auditId, synthesis);
      toast.success('Export DOCX téléchargé');
    } catch {
      toast.error('Erreur lors de l\'export DOCX');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-7 w-7 animate-spin text-cyan-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {auditId && (
              <button
                onClick={() => navigate(`/audits/${auditId}`)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <FileBarChart2 className="w-5 h-5 text-emerald-400" />
            <h1 className="text-2xl font-semibold text-white">Rapport de synthèse</h1>
          </div>
          {auditName && (
            <p className="text-sm text-slate-400 pl-6">
              Projet : <span className="text-slate-200 font-medium">{auditName}</span>
            </p>
          )}
          {!auditId && (
            <p className="text-sm text-slate-500 pl-6">
              Aucun projet sélectionné — accédez au rapport depuis la fiche projet.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* IA button */}
          <Button
            size="sm"
            onClick={handleAnalyze}
            disabled={analyzing || !auditId}
            className="bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-400 gap-1.5 text-xs disabled:opacity-40"
          >
            {analyzing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {analysisProgress || 'Analyse…'}
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                Analyser par IA
              </>
            )}
          </Button>

          {/* Export TXT */}
          <Button
            size="sm"
            onClick={handleExportTxt}
            disabled={!auditId}
            className="bg-slate-700/40 hover:bg-slate-700/60 border border-slate-600/40 text-slate-300 gap-1.5 text-xs disabled:opacity-40"
          >
            <FileText className="w-3.5 h-3.5" />
            TXT
          </Button>

          {/* Export DOCX */}
          <Button
            size="sm"
            onClick={handleExportDocx}
            disabled={exporting || !auditId}
            className="bg-blue-700/20 hover:bg-blue-700/30 border border-blue-600/30 text-blue-300 gap-1.5 text-xs disabled:opacity-40"
          >
            {exporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileDown className="w-3.5 h-3.5" />
            )}
            DOCX
          </Button>

          {/* Sauvegarder */}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !auditId}
            className="bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 gap-1.5 text-xs"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Sauvegarder
          </Button>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {sections.map((sec) => (
          <div
            key={sec.key}
            className="bg-[#0f111a] border border-slate-700/50 rounded-xl p-5 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-slate-600/40 to-transparent" />
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-3">
              {sec.label}
            </label>
            <Textarea
              value={synthesis[sec.key]}
              onChange={(e) =>
                setSynthesis((prev) => ({ ...prev, [sec.key]: e.target.value }))
              }
              placeholder={sec.placeholder}
              disabled={!auditId}
              className="min-h-[120px] bg-[#151825] border-slate-700/50 text-slate-200 placeholder:text-slate-600 resize-none focus:border-indigo-500/50 text-sm leading-relaxed"
            />
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 pb-6">
        <Button
          size="sm"
          onClick={handleExportTxt}
          disabled={!auditId}
          className="bg-slate-700/40 hover:bg-slate-700/60 border border-slate-600/40 text-slate-300 gap-1.5 text-xs disabled:opacity-40"
        >
          <FileText className="w-3.5 h-3.5" />
          Exporter TXT
        </Button>
        <Button
          size="sm"
          onClick={handleExportDocx}
          disabled={exporting || !auditId}
          className="bg-blue-700/20 hover:bg-blue-700/30 border border-blue-600/30 text-blue-300 gap-1.5 text-xs disabled:opacity-40"
        >
          {exporting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <FileDown className="w-3.5 h-3.5" />
          )}
          Exporter DOCX
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving || !auditId}
          className="bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 gap-1.5 text-xs"
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          Sauvegarder le rapport
        </Button>
      </div>
    </div>
  );
};

export default Rapport;
