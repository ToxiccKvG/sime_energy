// Props partagées par tous les onglets IoT
export interface IotTabProps {
  organizationId: string;
  userId: string;
  siteId: string | null;
  onSiteChange: (siteId: string) => void;
}
