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
import { Bot, Clock, MessageSquare, Loader2, Key, X, Plus } from "lucide-react";

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
    pre_service_active: false,
    initial_message_1: "",
    initial_message_2: "",
    initial_message_3: "",
    delay_between_messages: 3,
    trigger_keywords: [] as string[],
    keyword_activation_enabled: false,
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
        pre_service_active: config.pre_service_active || false,
        initial_message_1: config.initial_message_1 || "",
        initial_message_2: config.initial_message_2 || "",
        initial_message_3: config.initial_message_3 || "",
        delay_between_messages: config.delay_between_messages || 3,
        trigger_keywords: config.trigger_keywords || [],
        keyword_activation_enabled: config.keyword_activation_enabled || false,
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
        <TabsList className="flex-wrap">
          <TabsTrigger value="general">Configurações Gerais</TabsTrigger>
          <TabsTrigger value="hours">Horário de Funcionamento</TabsTrigger>
          <TabsTrigger value="triggers">Gatilhos</TabsTrigger>
          <TabsTrigger value="preservice">Pré-Atendimento</TabsTrigger>
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

        <TabsContent value="preservice" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Pré-Atendimento Automático
                  </CardTitle>
                  <CardDescription>
                    Sequência de mensagens enviadas ao primeiro contato
                  </CardDescription>
                </div>
                <Switch
                  checked={formData.pre_service_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, pre_service_active: checked })}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="msg1">Mensagem 1</Label>
                <Textarea
                  id="msg1"
                  value={formData.initial_message_1}
                  onChange={(e) => setFormData({ ...formData, initial_message_1: e.target.value })}
                  placeholder="Primeira mensagem de boas-vindas..."
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="msg2">Mensagem 2</Label>
                <Textarea
                  id="msg2"
                  value={formData.initial_message_2}
                  onChange={(e) => setFormData({ ...formData, initial_message_2: e.target.value })}
                  placeholder="Segunda mensagem..."
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="msg3">Mensagem 3</Label>
                <Textarea
                  id="msg3"
                  value={formData.initial_message_3}
                  onChange={(e) => setFormData({ ...formData, initial_message_3: e.target.value })}
                  placeholder="Terceira mensagem..."
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="delay">Delay entre mensagens (segundos)</Label>
                <Input
                  id="delay"
                  type="number"
                  value={formData.delay_between_messages}
                  onChange={(e) => setFormData({ ...formData, delay_between_messages: parseInt(e.target.value) || 3 })}
                  min={1}
                  max={30}
                />
              </div>
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
