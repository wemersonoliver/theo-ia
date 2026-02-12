
# Pagina de Vendas - Landing Page Persuasiva

## Objetivo
Criar uma landing page moderna e persuasiva na rota `/` (substituindo o redirect para `/dashboard`) para vender o sistema de automacao WhatsApp com IA. A pagina sera publica (sem autenticacao).

## Estrutura da Pagina

### 1. Hero Section
- Titulo impactante: "Seu Funcionario Digital que Trabalha 24h por Dia"
- Subtitulo com a proposta de valor: atendimento automatizado via WhatsApp
- Destaque do preco: R$ 97/mes com badge "7 dias gratis"
- CTA principal: "Comece Seu Teste Gratis de 7 Dias" (link para `/register`)
- Animacao sutil de entrada dos elementos

### 2. Secao "Problema vs Solucao"
- Gatilhos de dor: custo de funcionarios, ferias, 13o, faltas, horario limitado
- Comparativo visual: Funcionario CLT vs Theo IA (custo, disponibilidade, eficiencia)

### 3. Secao de Funcionalidades (cards com icones)
- Atendimento automatico 24/7 via WhatsApp
- Qualificacao inteligente de leads/clientes
- Agendamento automatico de consultas e reunioes
- Base de conhecimento personalizada
- Lembretes automaticos de compromissos
- Confirmacao de agendamentos por IA
- Multiplas conversas simultaneas
- Relatorios e metricas no dashboard

### 4. Secao de Gatilhos Mentais
- Card comparativo: "CLT vs Theo IA"
  - CLT: Salario + encargos (~R$ 3.000+/mes), 8h/dia, ferias, 13o, faltas
  - Theo IA: R$ 97/mes, 24h/dia, 7 dias/semana, sem ferias, nunca fica doente
- Contagem de economia anual

### 5. Secao de Preco
- Card de preco unico e destacado: R$ 97/mes
- Badge "7 dias gratis"
- Lista de tudo que esta incluso
- CTA: "Comecar Agora - 7 Dias Gratis"

### 6. Secao FAQ (Accordion)
- Perguntas frequentes sobre o produto

### 7. CTA Final
- Urgencia: "Comece hoje e veja resultados em minutos"
- Botao final para registro

## Detalhes Tecnicos

### Arquivos a criar/modificar:
1. **`src/pages/LandingPage.tsx`** (novo) - Pagina de vendas completa com todas as secoes
2. **`src/App.tsx`** (modificar) - Alterar rota `/` para renderizar `LandingPage` ao inves de redirecionar para `/dashboard`

### Abordagem:
- Pagina standalone sem usar o `DashboardLayout` (sem sidebar)
- Estilo dark com gradientes para visual premium
- Totalmente responsiva (mobile-first)
- Uso de componentes existentes: `Button`, `Card`, `Accordion`, `Badge`
- Icones do `lucide-react` para cada funcionalidade
- Animacoes CSS com Tailwind (`animate-` classes)
- Navegacao no topo com links para Login e Registro
