import { FileText, MapPin, TrendingUp, AlertTriangle } from "lucide-react";
import { KPICard } from "@/components/KPICard";
import { RecentAudits } from "@/components/RecentAudits";
import { QuickActions } from "@/components/QuickActions";


const Dashboard = () => {
  const totalAudits = 12;
  const activeAudits = 5;
  const totalSites = 28;
  const completionRate = 67;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-foreground">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Vue d'ensemble
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Audits actifs"
          value={activeAudits.toString()}
          subtitle={`${totalAudits} audits`}
          icon={FileText}
          variant="default"
        />
        <KPICard
          title="Sites audités"
          value={totalSites.toString()}
          subtitle="Répartis sur Dakar"
          icon={MapPin}
          variant="default"
        />
        <KPICard
          title="Taux de complétion"
          value={`${completionRate}%`}
          subtitle="Audits en cours"
          icon={TrendingUp}
          trend={{ value: "12%", isPositive: true }}
          variant="success"
        />
        <KPICard
          title="Actions requises"
          value="3"
          subtitle="À traiter"
          icon={AlertTriangle}
          variant="warning"
        />
      </div>

      <div className="rounded-lg border p-6 bg-card text-card-foreground">
        Carte désactivée temporairement.
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentAudits />
        </div>
        <div>
          <QuickActions />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
