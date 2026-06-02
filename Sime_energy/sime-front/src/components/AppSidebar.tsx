import { LayoutDashboard, FileText, Package, ClipboardCheck, Settings } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const mainItems = [
  { title: "Accueil",     label: "Accueil",    url: "/",            icon: LayoutDashboard, blocked: false },
  { title: "Facturation", label: "Factures",   url: "/facturation", icon: FileText,        blocked: false },
  { title: "Inventaire",  label: "Inventaire", url: "/inventaire",  icon: Package,         blocked: false },
  { title: "Projets",     label: "Projets",    url: "/audits",      icon: ClipboardCheck,  blocked: false },
];

const settingsItem = { title: "Paramètres", label: "Réglages", url: "/parametres", icon: Settings };

const btnBase = cn(
  "group relative flex flex-col items-center justify-center gap-[3px]",
  "h-14 w-[54px] rounded-[14px]",
  "bg-gradient-to-b from-[hsl(218_44%_17%)] to-[hsl(220_46%_11%)]",
  "border border-[hsl(218_34%_23%/0.8)]",
  "shadow-[inset_0_1px_0_hsl(210_60%_80%/0.05),0_2px_6px_hsl(220_50%_3%/0.35)]",
  "transition-all duration-200 ease-out",
  "hover:-translate-y-px hover:scale-[1.04]",
  "hover:border-[hsl(214_55%_42%/0.55)]",
  "hover:shadow-[inset_0_1px_0_hsl(210_60%_80%/0.08),0_6px_18px_hsl(220_50%_3%/0.55)]",
);

const btnActive = cn(
  "border-[hsl(214_90%_62%/0.55)]",
  "shadow-[0_0_22px_hsl(214_90%_62%/0.22),0_4px_14px_hsl(220_50%_3%/0.45),inset_0_1px_0_hsl(214_90%_62%/0.12)]",
);

function NavBtn({ item }: { item: { title: string; label: string; url: string; icon: React.ElementType; blocked?: boolean } }) {
  return (
    <Tooltip key={item.title}>
      <TooltipTrigger asChild>
        <NavLink
          to={item.url}
          className={cn(btnBase, item.blocked && "opacity-40 cursor-not-allowed grayscale")}
          activeClassName={btnActive}
          onClick={(e) => { if (item.blocked) e.preventDefault(); }}
        >
          {/* Active left accent bar */}
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[hsl(214_90%_62%)] opacity-0 group-[[aria-current=page]]:opacity-100 transition-opacity duration-300" />

          <item.icon className="h-[18px] w-[18px] text-slate-400/70 transition-colors duration-200 group-hover:text-slate-200 group-[[aria-current=page]]:text-[hsl(214_85%_73%)]" />
          <span className="text-[7.5px] font-semibold tracking-widest leading-none uppercase text-slate-500 transition-colors duration-200 group-hover:text-slate-400 group-[[aria-current=page]]:text-[hsl(214_75%_68%)]">
            {item.label}
          </span>
        </NavLink>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={12}>
        {item.title}
      </TooltipContent>
    </Tooltip>
  );
}

export function AppSidebar() {
  return (
    <div
      className="fixed left-4 top-1/2 z-40 -translate-y-1/2 hidden md:flex flex-col items-center gap-1.5 px-2 py-3 rounded-[20px] border border-white/[0.06] shadow-[0_16px_56px_hsl(222_58%_4%/0.85),0_4px_16px_hsl(220_50%_3%/0.55),inset_0_1px_0_hsl(214_70%_65%/0.07)]"
      style={{
        background: "linear-gradient(175deg, hsl(218 50% 12%) 0%, hsl(220 54% 8%) 55%, hsl(222 60% 5%) 100%)",
      }}
    >
      {mainItems.map((item) => (
        <NavBtn key={item.url} item={item} />
      ))}

      <div className="w-8 h-px bg-[hsl(218_34%_22%)] my-0.5" />

      <NavBtn item={settingsItem} />
    </div>
  );
}
