import { Search, Bell, LogOut } from "lucide-react";
import { Input } from "@/components/ui/input";
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

export function AppHeader() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Extraire les informations de l'utilisateur
  const userEmail = user?.email || "utilisateur@example.com";
  const userMetadata = user?.user_metadata || {};
  const firstName = userMetadata.first_name || "";
  const lastName = userMetadata.last_name || "";

  // Construire le nom complet
  const fullName = firstName && lastName ? `${firstName} ${lastName}` : userEmail.split("@")[0];

  // Générer les initiales
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
      toast({
        title: "Déconnexion réussie",
        description: "À bientôt!",
      });
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
    <header className="sticky top-0 z-50 flex h-16 items-center gap-4 border-b border-white/10 bg-[#0b0d14]/95 px-4 text-white shadow-lg backdrop-blur">
      <div className="ml-2 flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5">
        <img src="/logo-sime.png" alt="SIME Logo" className="h-10 w-10 object-contain" />
      </div>

      <div className="flex flex-1 items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            type="search"
            placeholder="Rechercher un audit, une organisation..."
            className="h-10 bg-white/5 pl-10 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="relative text-white hover:bg-white/10">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-warning" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 border-l border-white/10 pl-4 text-left text-white transition-opacity hover:opacity-80">
              <div className="text-right">
                <p className="text-sm font-medium text-white">{fullName}</p>
                <p className="text-xs text-slate-400">{userEmail}</p>
              </div>
              <Avatar>
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 border-white/10 bg-[#0b0d14]/95 text-white shadow-xl backdrop-blur"
          >
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium text-white">{fullName}</p>
              <p className="text-xs text-slate-400">{userEmail}</p>
            </div>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem asChild className="hover:bg-white/10">
              <Link to="/compte" className="cursor-pointer text-white">
                Mon compte
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-white/10" />
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
