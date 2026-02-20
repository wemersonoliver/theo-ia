import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Users,
  Search,
  Plus,
  Pencil,
  Trash2,
  MessageSquare,
  Loader2,
  RefreshCw,
  Phone,
  Mail,
  FileText,
  User,
} from "lucide-react";
import { useContacts, type Contact } from "@/hooks/useContacts";

function getInitials(name: string | null, phone: string) {
  if (name && name.trim()) {
    const parts = name.trim().split(" ");
    return parts.length > 1
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0][0].toUpperCase();
  }
  return phone.slice(-2);
}

function ContactAvatar({ name, phone }: { name: string | null; phone: string }) {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm shrink-0">
      {getInitials(name, phone)}
    </div>
  );
}

interface ContactFormData {
  phone: string;
  name: string;
  email: string;
  notes: string;
}

const emptyForm: ContactFormData = { phone: "", name: "", email: "", notes: "" };

export default function Contacts() {
  const navigate = useNavigate();
  const { contacts, isLoading, updateContact, deleteContact, createContact, syncFromConversations } =
    useContacts();

  const [search, setSearch] = useState("");
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [isNewDialog, setIsNewDialog] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<ContactFormData>(emptyForm);

  // Sync on first load
  useEffect(() => {
    syncFromConversations.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.phone.includes(q) ||
      (c.name || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q)
    );
  });

  function openEdit(contact: Contact) {
    setEditingContact(contact);
    setForm({
      phone: contact.phone,
      name: contact.name || "",
      email: contact.email || "",
      notes: contact.notes || "",
    });
  }

  function openNew() {
    setForm(emptyForm);
    setIsNewDialog(true);
  }

  function handleSaveEdit() {
    if (!editingContact) return;
    updateContact.mutate(
      { id: editingContact.id, ...form },
      { onSuccess: () => setEditingContact(null) }
    );
  }

  function handleCreate() {
    createContact.mutate(
      { phone: form.phone, name: form.name, email: form.email, notes: form.notes },
      { onSuccess: () => setIsNewDialog(false) }
    );
  }

  function handleStartConversation(phone: string) {
    navigate(`/conversations?phone=${encodeURIComponent(phone)}`);
  }

  return (
    <DashboardLayout title="Contatos" description="Gerencie os contatos do seu WhatsApp">
      {/* Header Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, telefone ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncFromConversations.mutate()}
            disabled={syncFromConversations.isPending}
          >
            {syncFromConversations.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Sincronizar
          </Button>
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Contato
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6">
        <Badge variant="secondary" className="text-sm px-3 py-1">
          <Users className="h-3.5 w-3.5 mr-1.5" />
          {contacts.length} contato{contacts.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
          <Users className="h-14 w-14 mb-4 opacity-30" />
          <p className="text-lg font-medium">
            {search ? "Nenhum contato encontrado" : "Nenhum contato ainda"}
          </p>
          <p className="text-sm mt-1">
            {search
              ? "Tente outra busca"
              : "Sincronize para importar contatos das suas conversas ou crie um manualmente"}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((contact) => (
            <Card key={contact.id} className="group hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <ContactAvatar name={contact.name} phone={contact.phone} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">
                      {contact.name || <span className="text-muted-foreground italic">Sem nome</span>}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <Phone className="h-3 w-3 shrink-0" />
                      <span className="truncate">{contact.phone}</span>
                    </div>
                    {contact.email && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate">{contact.email}</span>
                      </div>
                    )}
                    {contact.notes && (
                      <div className="flex items-start gap-1 text-xs text-muted-foreground mt-1">
                        <FileText className="h-3 w-3 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{contact.notes}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-1.5 mt-4">
                  <Button
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={() => handleStartConversation(contact.phone)}
                  >
                    <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                    Conversar
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEdit(contact)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 hover:border-destructive hover:text-destructive"
                    onClick={() => setDeleteId(contact.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingContact} onOpenChange={(o) => !o && setEditingContact(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Editar Contato
            </DialogTitle>
          </DialogHeader>
          <ContactForm
            form={form}
            setForm={setForm}
            onSave={handleSaveEdit}
            onCancel={() => setEditingContact(null)}
            isPending={updateContact.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* New Contact Dialog */}
      <Dialog open={isNewDialog} onOpenChange={(o) => !o && setIsNewDialog(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Novo Contato
            </DialogTitle>
          </DialogHeader>
          <ContactForm
            form={form}
            setForm={setForm}
            onSave={handleCreate}
            onCancel={() => setIsNewDialog(false)}
            isPending={createContact.isPending}
            phoneEditable
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover contato?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita. O histórico de conversas não será afetado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteId) {
                  deleteContact.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
                }
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

interface ContactFormProps {
  form: ContactFormData;
  setForm: (f: ContactFormData) => void;
  onSave: () => void;
  onCancel: () => void;
  isPending: boolean;
  phoneEditable?: boolean;
}

function ContactForm({ form, setForm, onSave, onCancel, isPending, phoneEditable }: ContactFormProps) {
  const update = (field: keyof ContactFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [field]: e.target.value });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="cf-phone">Telefone *</Label>
        <Input
          id="cf-phone"
          value={form.phone}
          onChange={update("phone")}
          placeholder="+55 11 99999-9999"
          disabled={!phoneEditable}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cf-name">Nome</Label>
        <Input id="cf-name" value={form.name} onChange={update("name")} placeholder="Nome do contato" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cf-email">E-mail</Label>
        <Input id="cf-email" type="email" value={form.email} onChange={update("email")} placeholder="email@exemplo.com" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cf-notes">Anotações</Label>
        <Textarea
          id="cf-notes"
          value={form.notes}
          onChange={update("notes")}
          placeholder="Informações adicionais sobre o contato..."
          rows={3}
        />
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button variant="outline" onClick={onCancel} disabled={isPending}>
          Cancelar
        </Button>
        <Button onClick={onSave} disabled={isPending || !form.phone.trim()}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar
        </Button>
      </div>
    </div>
  );
}
