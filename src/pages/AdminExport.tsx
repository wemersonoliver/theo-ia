import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Download, Database, Users, HardDrive, Bot, Calendar, MessageSquare, FileText, Shield, Bell, Settings, Wand2 } from "lucide-react";
import { Navigate } from "react-router-dom";

interface ExportItem {
  label: string;
  description: string;
  action: string;
  tableName?: string;
  icon: React.ElementType;
  category: string;
}

const exportItems: ExportItem[] = [
  // Auth / Users
  { label: "Auth Users", description: "Usuários do sistema de autenticação", action: "export_auth_users", icon: Users, category: "Usuários" },
  { label: "Profiles", description: "Perfis dos usuários (nome, email, avatar)", action: "export_table", tableName: "profiles", icon: Users, category: "Usuários" },
  { label: "User Roles", description: "Funções/permissões dos usuários", action: "export_table", tableName: "user_roles", icon: Shield, category: "Usuários" },
  // WhatsApp
  { label: "WhatsApp Instances", description: "Instâncias do WhatsApp conectadas", action: "export_table", tableName: "whatsapp_instances", icon: MessageSquare, category: "WhatsApp" },
  { label: "WhatsApp Conversations", description: "Histórico de conversas", action: "export_table", tableName: "whatsapp_conversations", icon: MessageSquare, category: "WhatsApp" },
  { label: "WhatsApp Pending Responses", description: "Respostas pendentes de processamento", action: "export_table", tableName: "whatsapp_pending_responses", icon: MessageSquare, category: "WhatsApp" },
  // IA
  { label: "AI Config", description: "Configurações do agente de IA", action: "export_table", tableName: "whatsapp_ai_config", icon: Bot, category: "Agente IA" },
  { label: "AI Sessions", description: "Sessões ativas do agente", action: "export_table", tableName: "whatsapp_ai_sessions", icon: Bot, category: "Agente IA" },
  { label: "Entrevistas Config", description: "Sessões de entrevista da IA", action: "export_table", tableName: "entrevistas_config", icon: Wand2, category: "Agente IA" },
  // Agendamentos
  { label: "Appointments", description: "Agendamentos dos clientes", action: "export_table", tableName: "appointments", icon: Calendar, category: "Agendamentos" },
  { label: "Appointment Slots", description: "Horários disponíveis configurados", action: "export_table", tableName: "appointment_slots", icon: Calendar, category: "Agendamentos" },
  // Outros
  { label: "Contacts", description: "Lista de contatos", action: "export_table", tableName: "contacts", icon: Users, category: "Dados" },
  { label: "Notification Contacts", description: "Contatos de notificação", action: "export_table", tableName: "notification_contacts", icon: Bell, category: "Dados" },
  { label: "Knowledge Base Documents", description: "Documentos da base de conhecimento", action: "export_table", tableName: "knowledge_base_documents", icon: FileText, category: "Dados" },
  { label: "Platform Settings", description: "Configurações da plataforma por usuário", action: "export_table", tableName: "platform_settings", icon: Settings, category: "Dados" },
  // Storage
  { label: "Storage Objects", description: "Arquivos armazenados no bucket", action: "export_storage_objects", icon: HardDrive, category: "Storage" },
];

function convertToCSV(data: Record<string, unknown>[]): string {
  if (!data || data.length === 0) return "";
  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(",")];
  for (const row of data) {
    const values = headers.map((h) => {
      const val = row[h];
      const str = val === null || val === undefined ? "" : typeof val === "object" ? JSON.stringify(val) : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    });
    csvRows.push(values.join(","));
  }
  return csvRows.join("\n");
}

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminExport() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .then(({ data }) => {
        setIsSuperAdmin(!!(data && data.length > 0));
        setLoading(false);
      });
  }, [user]);

  const handleExport = async (item: ExportItem) => {
    const key = item.tableName || item.action;
    setExporting(key);
    try {
      const body: Record<string, string> = { action: item.action };
      if (item.tableName) body.tableName = item.tableName;

      const { data, error } = await supabase.functions.invoke("admin-users", { body });
      if (error) throw error;

      const rows = data?.data;
      if (!rows || rows.length === 0) {
        toast({ title: "Vazio", description: `Nenhum dado encontrado em ${item.label}` });
        setExporting(null);
        return;
      }

      const csv = convertToCSV(rows);
      downloadCSV(csv, data.tableName || item.label.toLowerCase().replace(/\s/g, "_"));
      toast({ title: "Exportado!", description: `${rows.length} registros exportados de ${item.label}` });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message || "Falha na exportação", variant: "destructive" });
    }
    setExporting(null);
  };

  if (loading) {
    return (
      <DashboardLayout title="Exportação" description="">
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </DashboardLayout>
    );
  }

  if (isSuperAdmin === false) {
    return <Navigate to="/dashboard" replace />;
  }

  const categories = [...new Set(exportItems.map((i) => i.category))];

  return (
    <DashboardLayout title="Exportação de Dados" description="Exporte os dados de cada tabela em CSV para importação externa">
      <div className="space-y-8">
        {categories.map((cat) => (
          <div key={cat}>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
              <Database className="h-5 w-5 text-primary" />
              {cat}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {exportItems
                .filter((i) => i.category === cat)
                .map((item) => {
                  const key = item.tableName || item.action;
                  const isLoading = exporting === key;
                  return (
                    <Card key={key} className="flex flex-col justify-between">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <item.icon className="h-4 w-4 text-primary" />
                          {item.label}
                        </CardTitle>
                        <CardDescription className="text-xs">{item.description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button
                          className="w-full"
                          variant="outline"
                          size="sm"
                          disabled={!!exporting}
                          onClick={() => handleExport(item)}
                        >
                          {isLoading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="mr-2 h-4 w-4" />
                          )}
                          Exportar CSV
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
}
