import { LogOut, Menu, LayoutDashboard, FileText, Package, ClipboardCheck, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NavLink } from "@/components/NavLink";

const mobileNavItems = [
  { title: "Accueil",     url: "/",            icon: LayoutDashboard },
  { title: "Facturation", url: "/facturation", icon: FileText },
  { title: "Inventaire",  url: "/inventaire",  icon: Package },
  { title: "Projets",     url: "/audits",      icon: ClipboardCheck },
  { title: "Paramètres",  url: "/parametres",  icon: Settings },
];

export function AppHeader() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const userEmail = user?.email || "utilisateur@example.com";
  const userMetadata = user?.user_metadata || {};
  const firstName = userMetadata.first_name || "";
  const lastName = userMetadata.last_name || "";

  const fullName = firstName && lastName ? `${firstName} ${lastName}` : userEmail.split("@")[0];

  const getInitials = () => {
    if (firstName && lastName) {
      return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    }
    const parts = fullName.split(" ");
    if (parts.length >= 2) {
      return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
    }
    return fullName.charAt(0).toUpperCase();
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/login");
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Erreur lors de la déconnexion",
        variant: "destructive",
      });
    }
  };

  return (
    <header
      className="sticky top-0 z-50 flex h-16 items-center gap-4 border-b border-border px-4 shadow-lg backdrop-blur-md"
      style={{
        background: 'linear-gradient(180deg, hsl(222 52% 11% / 0.97) 0%, hsl(220 47% 8% / 0.97) 100%)',
      }}
    >
      {/* Mobile hamburger — hidden on md+ */}
      <Sheet>
        <SheetTrigger asChild>
          <button className="md:hidden flex items-center justify-center h-9 w-9 rounded-lg border border-border hover:bg-accent transition-colors" aria-label="Ouvrir le menu">
            <Menu className="h-4 w-4 text-foreground" />
          </button>
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-64 p-0 border-r border-white/[0.06]"
          style={{ background: 'linear-gradient(175deg, hsl(218 50% 12%) 0%, hsl(220 54% 8%) 55%, hsl(222 60% 5%) 100%)' }}
        >
          <SheetHeader className="px-4 pt-5 pb-3 border-b border-white/[0.06]">
            <SheetTitle className="text-sm font-semibold text-slate-200 tracking-wide">SIMEE</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-1 px-3 py-3">
            {mobileNavItems.map((item) => (
              <NavLink
                key={item.url}
                to={item.url}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-400 hover:bg-white/[0.06] hover:text-slate-200 transition-colors"
                activeClassName="bg-white/[0.08] text-slate-100"
                end={item.url === "/"}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.title}
              </NavLink>
            ))}
          </nav>
        </SheetContent>
      </Sheet>

      <div className="ml-2 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted">
        <img src="/logo-sime.png" alt="SIME Logo" className="h-10 w-10 object-contain" />
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 border-l border-border pl-4 text-left transition-opacity hover:opacity-80">
              <Avatar>
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 border-border bg-background/95 text-foreground shadow-xl backdrop-blur"
          >
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium text-foreground">{fullName}</p>
              <p className="text-xs text-muted-foreground">{userEmail}</p>
            </div>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem asChild className="hover:bg-accent">
              <Link to="/compte" className="cursor-pointer text-foreground">
                Mon compte
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="cursor-pointer text-red-300 hover:bg-red-500/10"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Se déconnecter
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
