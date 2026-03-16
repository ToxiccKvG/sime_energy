export default function IOT() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">IOT</h1>
        <p className="mt-1 text-sm text-slate-300">
          Espace de travail pour intégrer les flux capteurs, ingestion temps réel, dashboards et automatisations.
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm text-slate-200">À faire</div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
          <li>Connecteurs capteurs (HTTP/MQTT, fichiers, APIs)</li>
          <li>Pipeline normalisation + stockage</li>
          <li>Visualisation séries temporelles + alerting</li>
        </ul>
      </div>
    </div>
  );
}

