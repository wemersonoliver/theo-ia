import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAppointmentSlots, AppointmentSlot } from "@/hooks/useAppointments";
import { useAuth } from "@/lib/auth";
import { Clock, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

const DAYS = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda" },
  { value: 2, label: "Terça" },
  { value: 3, label: "Quarta" },
  { value: 4, label: "Quinta" },
  { value: 5, label: "Sexta" },
  { value: 6, label: "Sábado" },
];

export default function AppointmentSettings() {
  const { user } = useAuth();
  const { slots, isLoading, saveSlot, deleteSlot, toggleSlotActive } = useAppointmentSlots();
  
  const [newSlot, setNewSlot] = useState({
    day_of_week: 1,
    start_time: "08:00",
    end_time: "18:00",
    slot_duration_minutes: 30,
  });

  const handleAddSlot = () => {
    if (!user) return;

    const existingSlot = slots.find(
      (s) => s.day_of_week === newSlot.day_of_week && s.start_time === newSlot.start_time + ":00"
    );

    if (existingSlot) {
      toast.error("Já existe um horário configurado para este período");
      return;
    }

    saveSlot.mutate({
      user_id: user.id,
      day_of_week: newSlot.day_of_week,
      start_time: newSlot.start_time + ":00",
      end_time: newSlot.end_time + ":00",
      slot_duration_minutes: newSlot.slot_duration_minutes,
      max_appointments_per_slot: 1,
      is_active: true,
    });
  };

  const formatTime = (time: string) => time.slice(0, 5);

  const groupedSlots = DAYS.map((day) => ({
    ...day,
    slots: slots.filter((s) => s.day_of_week === day.value),
  }));

  if (isLoading) {
    return (
      <DashboardLayout
        title="Configurar Horários"
        description="Configure seus horários disponíveis para agendamento"
      >
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Configurar Horários"
      description="Configure seus horários disponíveis para agendamento"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Add new slot */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Adicionar Horário
            </CardTitle>
            <CardDescription>
              Configure um novo período de atendimento
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Dia da Semana</Label>
              <select
                value={newSlot.day_of_week}
                onChange={(e) => setNewSlot({ ...newSlot, day_of_week: parseInt(e.target.value) })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {DAYS.map((day) => (
                  <option key={day.value} value={day.value}>
                    {day.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Horário Início</Label>
                <Input
                  type="time"
                  value={newSlot.start_time}
                  onChange={(e) => setNewSlot({ ...newSlot, start_time: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Horário Fim</Label>
                <Input
                  type="time"
                  value={newSlot.end_time}
                  onChange={(e) => setNewSlot({ ...newSlot, end_time: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Duração do Atendimento (minutos)</Label>
              <Input
                type="number"
                min={15}
                max={120}
                step={15}
                value={newSlot.slot_duration_minutes}
                onChange={(e) => setNewSlot({ ...newSlot, slot_duration_minutes: parseInt(e.target.value) })}
              />
            </div>

            <Button onClick={handleAddSlot} className="w-full" disabled={saveSlot.isPending}>
              {saveSlot.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Adicionar Horário
            </Button>
          </CardContent>
        </Card>

        {/* Existing slots */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Horários Configurados
            </CardTitle>
            <CardDescription>
              Gerencie seus horários de atendimento
            </CardDescription>
          </CardHeader>
          <CardContent>
            {slots.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhum horário configurado. Adicione horários para começar a receber agendamentos.
              </p>
            ) : (
              <div className="space-y-4">
                {groupedSlots
                  .filter((day) => day.slots.length > 0)
                  .map((day) => (
                    <div key={day.value} className="space-y-2">
                      <h4 className="font-medium text-sm text-muted-foreground">
                        {day.label}
                      </h4>
                      {day.slots.map((slot) => (
                        <div
                          key={slot.id}
                          className="flex items-center justify-between rounded-lg border p-3"
                        >
                          <div className="flex items-center gap-4">
                            <Switch
                              checked={slot.is_active}
                              onCheckedChange={(checked) =>
                                toggleSlotActive.mutate({ id: slot.id, isActive: checked })
                              }
                            />
                            <div>
                              <p className={`font-medium ${!slot.is_active ? "text-muted-foreground" : ""}`}>
                                {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Atendimentos de {slot.slot_duration_minutes} min
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteSlot.mutate(slot.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
