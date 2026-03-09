import { LayoutDashboard, FileText, Activity, Package, ClipboardCheck, Settings } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const menuItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, blocked:true },
  { title: "Facturation", url: "/facturation", icon: FileText, blocked: false },
  { title: "Mesures", url: "/mesures", icon: Activity, blocked: true },
  { title: "Inventaire", url: "/inventaire", icon: Package, blocked: true },
  { title: "Audits", url: "/audits", icon: ClipboardCheck, blocked: false },
  { title: "Paramètres", url: "/parametres", icon: Settings, blocked: true },
];

export function AppSidebar() {
  const location = useLocation();
  const currentPath = location.pathname;

  const isActive = (path: string) => currentPath === path;

  return (
    <div className="fixed left-4 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-2">
      {menuItems.map((item) => (
        <NavLink
          key={item.title}
          to={item.url}
          className={`group relative flex h-12 w-12 items-center justify-center rounded-xl
            border border-white/10 bg-[#0b0d14]/90 text-white shadow-lg backdrop-blur
            transition-all hover:-translate-y-0.5 hover:scale-105 hover:bg-white/10
            ${item.blocked ? 'opacity-40 cursor-not-allowed grayscale' : ''}
          `}
          activeClassName="bg-primary text-primary-foreground shadow-primary/30"
          onClick={(e) => {
            if (item.blocked) {
              e.preventDefault();
              return;
            }
          }}
        >
          <item.icon
            className={`h-5 w-5 transition-colors ${
              isActive(item.url) ? 'text-primary-foreground' : 'text-white/80'
            }`}
          />
          <span className="pointer-events-none absolute left-16 whitespace-nowrap rounded-lg border border-white/10 bg-[#0b0d14]/90 px-3 py-2 text-sm font-medium text-white/90 shadow-xl opacity-0 transition-opacity backdrop-blur group-hover:opacity-100">
            {item.title}
          </span>
        </NavLink>
      ))}
    </div>
  );
}
