import { ReactNode, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

interface DashboardLayoutProps {
  children: ReactNode;
  title: string;
  description?: string;
}

export function DashboardLayout({ children, title, description }: DashboardLayoutProps) {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full">
      {/* Sidebar Desktop - escondida em mobile */}
      {!isMobile && <Sidebar />}

      <div className="flex flex-1 flex-col">
        {/* Header Mobile com Hambúrguer */}
        {isMobile && (
          <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background px-4">
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Abrir menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0" hideClose>
                <Sidebar mobile onNavigate={() => setSidebarOpen(false)} />
              </SheetContent>
            </Sheet>
            <h1 className="text-lg font-semibold truncate">{title}</h1>
          </header>
        )}

        <main className="flex-1 overflow-auto">
          <div className="container py-4 md:py-6">
            {/* Esconder titulo duplicado em mobile (já está no header) */}
            {!isMobile && (
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-foreground">{title}</h1>
                {description && (
                  <p className="text-muted-foreground">{description}</p>
                )}
              </div>
            )}
            {/* Mostrar descrição em mobile abaixo do conteúdo principal */}
            {isMobile && description && (
              <p className="text-sm text-muted-foreground mb-4">{description}</p>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
