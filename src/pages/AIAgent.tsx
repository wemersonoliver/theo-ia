import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useAIConfig } from "@/hooks/useAIConfig";
import { Bot, Clock, Loader2, Key, X, Plus, Timer, Bell } from "lucide-react";

const DAYS = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

export default function AIAgent() {
  const { config, isLoading, saveConfig, toggleActive } = useAIConfig();
  
  const [formData, setFormData] = useState({
    agent_name: "Assistente Virtual",
    custom_prompt: "",
    business_hours_start: "08:00",
    business_hours_end: "18:00",
    business_days: [1, 2, 3, 4, 5],
    out_of_hours_message: "Olá! Estou fora do horário de atendimento. Retornarei em breve!",
    handoff_message: "Um momento, vou transferir você para um atendente.",
    max_messages_without_human: 10,
    trigger_keywords: [] as string[],
    keyword_activation_enabled: false,
    response_delay_seconds: 5,
    reminder_enabled: false,
    reminder_hours_before: 2,
    reminder_message_template: "Olá {nome}! Lembrando que você tem um agendamento {dia_referencia} às {hora}. Por favor, confirme sua presença respondendo SIM ou informe se precisa reagendar.",
  });

  const [newKeyword, setNewKeyword] = useState("");

  useEffect(() => {
    if (config) {
      setFormData({
        agent_name: config.agent_name || "Assistente Virtual",
        custom_prompt: config.custom_prompt || "",
        business_hours_start: config.business_hours_start || "08:00",
        business_hours_end: config.business_hours_end || "18:00",
        business_days: config.business_days || [1, 2, 3, 4, 5],
        out_of_hours_message: config.out_of_hours_message || "",
        handoff_message: config.handoff_message || "",
        max_messages_without_human: config.max_messages_without_human || 10,
        trigger_keywords: config.trigger_keywords || [],
        keyword_activation_enabled: config.keyword_activation_enabled || false,
        response_delay_seconds: config.response_delay_seconds ?? 5,
        reminder_enabled: config.reminder_enabled || false,
        reminder_hours_before: config.reminder_hours_before || 2,
        reminder_message_template: config.reminder_message_template || "Olá {nome}! Lembrando que você tem um agendamento {dia_referencia} às {hora}. Por favor, confirme sua presença respondendo SIM ou informe se precisa reagendar.",
      });
    }
  }, [config]);

  const handleSave = () => {
    saveConfig.mutate(formData);
  };

  const handleDayToggle = (day: number) => {
    setFormData((prev) => ({
      ...prev,
      business_days: prev.business_days.includes(day)
        ? prev.business_days.filter((d) => d !== day)
        : [...prev.business_days, day].sort(),
    }));
  };

  const handleAddKeyword = () => {
    const keyword = newKeyword.trim().toLowerCase();
    if (keyword && !formData.trigger_keywords.includes(keyword)) {
      setFormData((prev) => ({
        ...prev,
        trigger_keywords: [...prev.trigger_keywords, keyword],
      }));
      setNewKeyword("");
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    setFormData((prev) => ({
      ...prev,
      trigger_keywords: prev.trigger_keywords.filter((k) => k !== keyword),
    }));
  };

  if (isLoading) {
    return (
      <DashboardLayout title="Agente IA" description="Configure seu agente de atendimento">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout 
      title="Agente IA" 
      description="Configure como seu agente de IA responde às mensagens"
    >
      {/* Toggle Principal */}
      <Card className="mb-6">
        <CardContent className="flex items-center justify-between py-6">
          <div className="flex items-center gap-3">
            <Bot className="h-8 w-8 text-primary" />
            <div>
              <h3 className="font-semibold">Agente IA</h3>
              <p className="text-sm text-muted-foreground">
                {config?.active ? "Respondendo mensagens automaticamente" : "Desativado"}
              </p>
            </div>
          </div>
          <Switch
            checked={config?.active || false}
            onCheckedChange={(checked) => toggleActive.mutate(checked)}
          />
        </CardContent>
      </Card>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
          <TabsTrigger value="general" className="min-w-fit">Geral</TabsTrigger>
          <TabsTrigger value="hours" className="min-w-fit">Horário</TabsTrigger>
          <TabsTrigger value="triggers" className="min-w-fit">Gatilhos</TabsTrigger>
          <TabsTrigger value="reminders" className="min-w-fit">Lembretes</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Configurações do Agente</CardTitle>
              <CardDescription>
                Personalize o comportamento do seu agente IA
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="agent_name">Nome do Agente</Label>
                <Input
                  id="agent_name"
                  value={formData.agent_name}
                  onChange={(e) => setFormData({ ...formData, agent_name: e.target.value })}
                  placeholder="Assistente Virtual"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="custom_prompt">Instruções Personalizadas</Label>
                <Textarea
                  id="custom_prompt"
                  value={formData.custom_prompt}
                  onChange={(e) => setFormData({ ...formData, custom_prompt: e.target.value })}
                  placeholder="Descreva como o agente deve se comportar, tom de voz, informações importantes sobre sua empresa..."
                  rows={6}
                />
                <p className="text-sm text-muted-foreground">
                  O agente usará essas instruções junto com a base de conhecimento para responder.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="max_messages">Máximo de mensagens sem humano</Label>
                <Input
                  id="max_messages"
                  type="number"
                  value={formData.max_messages_without_human}
                  onChange={(e) => setFormData({ ...formData, max_messages_without_human: parseInt(e.target.value) || 10 })}
                  min={1}
                  max={50}
                />
                <p className="text-sm text-muted-foreground">
                  Após essa quantidade, a IA sugere transferir para humano.
                </p>
              </div>

              <div className="space-y-2 rounded-lg border p-4 bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <Timer className="h-4 w-4 text-primary" />
                  <Label htmlFor="response_delay">Tempo de espera antes de responder (segundos)</Label>
                </div>
                <Input
                  id="response_delay"
                  type="number"
                  value={formData.response_delay_seconds}
                  onChange={(e) => setFormData({ ...formData, response_delay_seconds: parseInt(e.target.value) || 5 })}
                  min={0}
                  max={60}
                />
                <p className="text-sm text-muted-foreground">
                  💡 A IA aguardará esse tempo após a última mensagem do cliente antes de responder. 
                  Isso permite que o cliente envie múltiplas mensagens seguidas sem ser "atropelado" pela IA.
                  Use 0 para resposta imediata.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="handoff_message">Mensagem de Transferência</Label>
                <Textarea
                  id="handoff_message"
                  value={formData.handoff_message}
                  onChange={(e) => setFormData({ ...formData, handoff_message: e.target.value })}
                  placeholder="Mensagem enviada quando transferir para atendente"
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          <Button onClick={handleSave} disabled={saveConfig.isPending}>
            {saveConfig.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar Configurações
          </Button>
        </TabsContent>

        <TabsContent value="hours" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Horário de Funcionamento
              </CardTitle>
              <CardDescription>
                Define quando o agente responde automaticamente
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="hours_start">Início</Label>
                  <Input
                    id="hours_start"
                    type="time"
                    value={formData.business_hours_start}
                    onChange={(e) => setFormData({ ...formData, business_hours_start: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hours_end">Fim</Label>
                  <Input
                    id="hours_end"
                    type="time"
                    value={formData.business_hours_end}
                    onChange={(e) => setFormData({ ...formData, business_hours_end: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label>Dias de Funcionamento</Label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((day) => (
                    <div key={day.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={`day-${day.value}`}
                        checked={formData.business_days.includes(day.value)}
                        onCheckedChange={() => handleDayToggle(day.value)}
                      />
                      <Label htmlFor={`day-${day.value}`} className="text-sm">
                        {day.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="out_of_hours">Mensagem Fora do Horário</Label>
                <Textarea
                  id="out_of_hours"
                  value={formData.out_of_hours_message}
                  onChange={(e) => setFormData({ ...formData, out_of_hours_message: e.target.value })}
                  placeholder="Mensagem enviada fora do horário de atendimento"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Button onClick={handleSave} disabled={saveConfig.isPending}>
            {saveConfig.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar Configurações
          </Button>
        </TabsContent>

        <TabsContent value="triggers" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Key className="h-5 w-5" />
                    Ativação por Palavras-Chave
                  </CardTitle>
                  <CardDescription>
                    A IA só responderá quando o cliente usar uma dessas palavras
                  </CardDescription>
                </div>
                <Switch
                  checked={formData.keyword_activation_enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, keyword_activation_enabled: checked })}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {formData.keyword_activation_enabled && (
                <>
                  <div className="flex gap-2">
                    <Input
                      value={newKeyword}
                      onChange={(e) => setNewKeyword(e.target.value)}
                      placeholder="Digite uma palavra-chave..."
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddKeyword())}
                    />
                    <Button onClick={handleAddKeyword} variant="secondary">
                      <Plus className="h-4 w-4 mr-1" />
                      Adicionar
                    </Button>
                  </div>

                  {formData.trigger_keywords.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {formData.trigger_keywords.map((keyword) => (
                        <Badge key={keyword} variant="secondary" className="px-3 py-1 text-sm">
                          {keyword}
                          <button
                            onClick={() => handleRemoveKeyword(keyword)}
                            className="ml-2 hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma palavra-chave cadastrada. Adicione palavras como: "atendimento", "orçamento", "ajuda", "informação"
                    </p>
                  )}

                  <p className="text-sm text-muted-foreground mt-4">
                    💡 Quando ativado, a IA só iniciará o atendimento se a primeira mensagem do cliente contiver uma das palavras-chave cadastradas.
                  </p>
                </>
              )}
              
              {!formData.keyword_activation_enabled && (
                <p className="text-sm text-muted-foreground">
                  Ative o switch acima para configurar as palavras-chave. Quando desativado, a IA responde a todas as mensagens normalmente.
                </p>
              )}
            </CardContent>
          </Card>

          <Button onClick={handleSave} disabled={saveConfig.isPending}>
            {saveConfig.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar Configurações
          </Button>
        </TabsContent>

        <TabsContent value="reminders" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Bell className="h-5 w-5" />
                    Lembretes Automáticos
                  </CardTitle>
                  <CardDescription>
                    Envie lembretes automáticos antes dos agendamentos via WhatsApp
                  </CardDescription>
                </div>
                <Switch
                  checked={formData.reminder_enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, reminder_enabled: checked })}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {formData.reminder_enabled && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="reminder_hours">Horas antes do agendamento</Label>
                    <Input
                      id="reminder_hours"
                      type="number"
                      value={formData.reminder_hours_before}
                      onChange={(e) => setFormData({ ...formData, reminder_hours_before: parseInt(e.target.value) || 2 })}
                      min={1}
                      max={24}
                    />
                    <p className="text-sm text-muted-foreground">
                      Define quantas horas antes do agendamento o lembrete será enviado.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reminder_template">Mensagem do Lembrete</Label>
                    <Textarea
                      id="reminder_template"
                      value={formData.reminder_message_template}
                      onChange={(e) => setFormData({ ...formData, reminder_message_template: e.target.value })}
                      placeholder="Mensagem do lembrete..."
                      rows={4}
                    />
                    <p className="text-sm text-muted-foreground">
                      Variáveis disponíveis: {"{nome}"}, {"{hora}"}, {"{dia_referencia}"} (hoje/amanhã), {"{titulo}"}, {"{data}"}
                    </p>
                  </div>

                  <div className="rounded-lg border p-4 bg-muted/30 space-y-2">
                    <h4 className="font-medium text-sm">⏰ Lógica Inteligente de Envio</h4>
                    <p className="text-sm text-muted-foreground">
                      Se o horário calculado do lembrete cair fora do horário comercial (ex: agendamento às 08:00 com lembrete 2h antes = 06:00), 
                      o sistema enviará o lembrete automaticamente <strong>no dia anterior</strong>, 2 horas antes do fim do expediente.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Quando o cliente confirmar respondendo "SIM" ou similar, a IA marcará automaticamente o agendamento como <strong>confirmado</strong>.
                    </p>
                  </div>
                </>
              )}

              {!formData.reminder_enabled && (
                <p className="text-sm text-muted-foreground">
                  Ative o switch acima para configurar os lembretes automáticos de agendamento.
                </p>
              )}
            </CardContent>
          </Card>

          <Button onClick={handleSave} disabled={saveConfig.isPending}>
            {saveConfig.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar Configurações
          </Button>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
