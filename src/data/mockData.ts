export interface MeetingParticipant {
  name: string;
  role: string;
  speakTime: number; // percentage
  sentiment: "positivo" | "neutral" | "negativo";
}

export interface MeetingTask {
  id: string;
  text: string;
  assignee: string;
  priority: "alta" | "media" | "baja";
  done: boolean;
  dueDate?: string;
}

export interface MeetingDecision {
  text: string;
  participants: string[];
}

export interface MeetingRisk {
  text: string;
  severity: "alta" | "media" | "baja";
}

export interface MeetingHighlight {
  speaker: string;
  text: string;
  time: string;
}

export interface CalendarEvent {
  title: string;
  date: string;
  time: string;
  type: "sugerido" | "confirmado";
}

export interface TranscriptLine {
  speaker: string;
  time: string;
  text: string;
}

export interface MeetingFull {
  id: string;
  title: string;
  date: string;
  time: string;
  duration: string;
  status: "completed" | "in-progress" | "scheduled";
  participants: MeetingParticipant[];
  tags: string[];
  fileType: "audio" | "video";
  transcript: TranscriptLine[];
  summary: string;
  tasks: MeetingTask[];
  decisions: MeetingDecision[];
  risks: MeetingRisk[];
  highlights: MeetingHighlight[];
  projects: string[];
  keyData: { label: string; value: string }[];
  openQuestions: string[];
  sentiment: "positivo" | "neutral" | "mixto" | "negativo";
  suggestedEvents: CalendarEvent[];
}

export const mockMeetings: MeetingFull[] = [
  {
    id: "1",
    title: "Revisión Sprint #14",
    date: "2026-04-15",
    time: "10:00",
    duration: "45 min",
    status: "completed",
    fileType: "audio",
    tags: ["Desarrollo", "Sprint"],
    sentiment: "positivo",
    projects: ["Plataforma v2.0", "App Móvil"],
    participants: [
      { name: "María García", role: "Product Manager", speakTime: 35, sentiment: "positivo" },
      { name: "Carlos López", role: "Tech Lead", speakTime: 40, sentiment: "positivo" },
      { name: "Ana Ruiz", role: "Frontend Dev", speakTime: 25, sentiment: "neutral" },
    ],
    transcript: [
      { speaker: "María García", time: "00:00", text: "Buenos días a todos. Empecemos con la revisión del sprint." },
      { speaker: "Carlos López", time: "00:15", text: "El módulo de pagos está al 80%. Nos falta la integración con Stripe." },
      { speaker: "Ana Ruiz", time: "00:42", text: "He detectado un problema de rendimiento en el dashboard. Las consultas a la base de datos son lentas." },
      { speaker: "María García", time: "01:10", text: "¿Podemos optimizar las consultas antes del lanzamiento?" },
      { speaker: "Carlos López", time: "01:25", text: "Sí, propongo añadir índices y cachear los resultados más frecuentes." },
      { speaker: "Ana Ruiz", time: "01:50", text: "De acuerdo. También necesitamos decidir si lanzamos la versión beta la próxima semana." },
      { speaker: "María García", time: "02:10", text: "Propongo lanzar el miércoles. ¿Alguna objeción?" },
      { speaker: "Carlos López", time: "02:20", text: "Ninguna por mi parte. Estaré listo." },
      { speaker: "Ana Ruiz", time: "02:35", text: "Perfecto. Prepararé el entorno de staging para el martes." },
    ],
    summary: "Reunión de revisión del Sprint #14. El módulo de pagos avanza al 80%, pendiente integración con Stripe. Se identificó un problema de rendimiento en el dashboard por consultas lentas. Se acordó optimizar con índices y caché. Fecha de lanzamiento beta: miércoles próximo.",
    tasks: [
      { id: "t1", text: "Completar integración con Stripe", assignee: "Carlos López", priority: "alta", done: false, dueDate: "2026-04-18" },
      { id: "t2", text: "Optimizar consultas del dashboard", assignee: "Ana Ruiz", priority: "alta", done: false, dueDate: "2026-04-17" },
      { id: "t3", text: "Añadir índices a la base de datos", assignee: "Carlos López", priority: "media", done: false, dueDate: "2026-04-16" },
      { id: "t4", text: "Implementar caché de resultados", assignee: "Carlos López", priority: "media", done: false },
      { id: "t5", text: "Preparar entorno de staging", assignee: "Ana Ruiz", priority: "alta", done: true, dueDate: "2026-04-15" },
    ],
    decisions: [
      { text: "Lanzamiento de la versión beta el miércoles", participants: ["María García", "Carlos López", "Ana Ruiz"] },
      { text: "Añadir índices y caché para optimizar rendimiento", participants: ["Carlos López", "Ana Ruiz"] },
    ],
    risks: [
      { text: "Rendimiento lento en el dashboard puede afectar la experiencia del usuario en producción", severity: "alta" },
      { text: "La integración con Stripe podría retrasarse si hay problemas con la API", severity: "media" },
    ],
    highlights: [
      { speaker: "Carlos López", text: "El módulo de pagos está al 80%", time: "00:15" },
      { speaker: "Ana Ruiz", text: "He detectado un problema de rendimiento en el dashboard", time: "00:42" },
      { speaker: "María García", text: "Propongo lanzar el miércoles", time: "02:10" },
    ],
    keyData: [
      { label: "Progreso pagos", value: "80%" },
      { label: "Fecha beta", value: "Miércoles 17 Abr" },
      { label: "Queries lentas", value: ">2s respuesta" },
    ],
    openQuestions: [
      "¿Qué plan de contingencia si Stripe tiene downtime durante el lanzamiento?",
      "¿Quién se encarga de la documentación para la beta?",
    ],
    suggestedEvents: [
      { title: "Lanzamiento Beta v2.0", date: "2026-04-17", time: "09:00", type: "sugerido" },
      { title: "Review integración Stripe", date: "2026-04-18", time: "15:00", type: "sugerido" },
    ],
  },
  {
    id: "2",
    title: "Planificación Q2 Marketing",
    date: "2026-04-14",
    time: "14:30",
    duration: "1h 20min",
    status: "completed",
    fileType: "video",
    tags: ["Marketing", "Estrategia"],
    sentiment: "positivo",
    projects: ["Campaña Verano 2026", "Rebranding"],
    participants: [
      { name: "Laura Martín", role: "CMO", speakTime: 30, sentiment: "positivo" },
      { name: "Diego Torres", role: "Content Manager", speakTime: 25, sentiment: "positivo" },
      { name: "Elena Vidal", role: "Social Media", speakTime: 20, sentiment: "neutral" },
      { name: "Pablo Sanz", role: "Designer", speakTime: 15, sentiment: "positivo" },
      { name: "Sofía Reyes", role: "Analyst", speakTime: 10, sentiment: "neutral" },
    ],
    transcript: [
      { speaker: "Laura Martín", time: "00:00", text: "Vamos a definir la estrategia de marketing para Q2. Tenemos un presupuesto de 150.000€." },
      { speaker: "Diego Torres", time: "00:30", text: "Propongo dividir: 40% en contenido, 35% en paid media y 25% en eventos." },
      { speaker: "Elena Vidal", time: "01:15", text: "En redes sociales, TikTok nos está dando un 3x más engagement que Instagram." },
      { speaker: "Pablo Sanz", time: "02:00", text: "El nuevo branding estará listo para mayo. Podemos lanzar la campaña de verano con la nueva identidad." },
    ],
    summary: "Definición de estrategia Q2 con presupuesto de 150.000€. División propuesta: 40% contenido, 35% paid media, 25% eventos. TikTok genera 3x más engagement que Instagram. Nuevo branding listo para mayo, alineado con campaña de verano.",
    tasks: [
      { id: "t6", text: "Preparar plan de contenidos Q2", assignee: "Diego Torres", priority: "alta", done: false, dueDate: "2026-04-20" },
      { id: "t7", text: "Configurar campañas paid media", assignee: "Elena Vidal", priority: "alta", done: false },
      { id: "t8", text: "Finalizar guía de marca", assignee: "Pablo Sanz", priority: "media", done: false, dueDate: "2026-05-01" },
      { id: "t9", text: "Informe ROI Q1", assignee: "Sofía Reyes", priority: "media", done: true },
      { id: "t10", text: "Contratar influencers TikTok", assignee: "Elena Vidal", priority: "alta", done: false },
      { id: "t11", text: "Reservar stand en feria Tech Madrid", assignee: "Laura Martín", priority: "media", done: false },
      { id: "t12", text: "Diseñar landing campaña verano", assignee: "Pablo Sanz", priority: "alta", done: false },
      { id: "t13", text: "Crear calendario editorial mayo", assignee: "Diego Torres", priority: "media", done: false },
    ],
    decisions: [
      { text: "Presupuesto Q2: 150.000€ dividido en contenido (40%), paid media (35%), eventos (25%)", participants: ["Laura Martín", "Diego Torres"] },
      { text: "Priorizar TikTok sobre Instagram para campañas orgánicas", participants: ["Elena Vidal", "Laura Martín"] },
      { text: "Lanzar campaña de verano con nuevo branding en mayo", participants: ["Pablo Sanz", "Laura Martín"] },
    ],
    risks: [
      { text: "El nuevo branding podría retrasarse y afectar el lanzamiento de la campaña de verano", severity: "media" },
    ],
    highlights: [
      { speaker: "Laura Martín", text: "Tenemos un presupuesto de 150.000€", time: "00:00" },
      { speaker: "Elena Vidal", text: "TikTok nos está dando un 3x más engagement que Instagram", time: "01:15" },
    ],
    keyData: [
      { label: "Presupuesto Q2", value: "150.000€" },
      { label: "Engagement TikTok", value: "3x vs Instagram" },
      { label: "Branding listo", value: "Mayo 2026" },
    ],
    openQuestions: [
      "¿Cuál es el ROI esperado de la inversión en influencers?",
      "¿Se necesita aprobación legal para la nueva identidad de marca?",
    ],
    suggestedEvents: [
      { title: "Review plan contenidos Q2", date: "2026-04-20", time: "10:00", type: "sugerido" },
      { title: "Lanzamiento nuevo branding", date: "2026-05-01", time: "09:00", type: "sugerido" },
    ],
  },
  {
    id: "3",
    title: "Sync con cliente Acme Corp",
    date: "2026-04-16",
    time: "09:00",
    duration: "30 min",
    status: "scheduled",
    fileType: "audio",
    tags: ["Cliente", "Acme"],
    sentiment: "neutral",
    projects: ["Portal Acme"],
    participants: [
      { name: "María García", role: "Account Manager", speakTime: 40, sentiment: "neutral" },
      { name: "Roberto Chen", role: "CTO Acme", speakTime: 35, sentiment: "neutral" },
      { name: "Julia Blanco", role: "PM Acme", speakTime: 25, sentiment: "neutral" },
    ],
    transcript: [],
    summary: "Reunión programada para revisar avances del portal de Acme Corp y discutir nuevos requisitos.",
    tasks: [],
    decisions: [],
    risks: [],
    highlights: [],
    keyData: [],
    openQuestions: [],
    suggestedEvents: [],
  },
  {
    id: "4",
    title: "Retrospectiva equipo producto",
    date: "2026-04-13",
    time: "16:00",
    duration: "55 min",
    status: "completed",
    fileType: "audio",
    tags: ["Producto", "Retro"],
    sentiment: "mixto",
    projects: ["Plataforma v2.0"],
    participants: [
      { name: "María García", role: "Product Manager", speakTime: 20, sentiment: "neutral" },
      { name: "Carlos López", role: "Tech Lead", speakTime: 25, sentiment: "positivo" },
      { name: "Ana Ruiz", role: "Frontend Dev", speakTime: 20, sentiment: "negativo" },
      { name: "Lucas Mora", role: "Backend Dev", speakTime: 15, sentiment: "neutral" },
      { name: "Isabel Díaz", role: "QA Lead", speakTime: 10, sentiment: "positivo" },
      { name: "Tomás Ferrer", role: "UX Designer", speakTime: 10, sentiment: "neutral" },
    ],
    transcript: [
      { speaker: "María García", time: "00:00", text: "Empecemos la retro. ¿Qué fue bien este sprint?" },
      { speaker: "Carlos López", time: "00:20", text: "La integración de CI/CD ha reducido los tiempos de deploy un 60%." },
      { speaker: "Ana Ruiz", time: "01:00", text: "Siento que las historias de usuario no estaban bien definidas. Tuve que rehacer el componente de filtros dos veces." },
      { speaker: "Isabel Díaz", time: "01:30", text: "La cobertura de tests subió al 85%, lo cual es excelente." },
    ],
    summary: "Retrospectiva del sprint. Aspectos positivos: CI/CD redujo tiempos de deploy un 60%, cobertura de tests al 85%. Áreas de mejora: definición de historias de usuario insuficiente, retrabajo en componente de filtros. Sentimiento mixto del equipo.",
    tasks: [
      { id: "t14", text: "Mejorar plantilla de historias de usuario", assignee: "María García", priority: "alta", done: false },
      { id: "t15", text: "Crear checklist de Definition of Ready", assignee: "María García", priority: "media", done: false },
      { id: "t16", text: "Documentar pipeline CI/CD", assignee: "Carlos López", priority: "baja", done: true },
    ],
    decisions: [
      { text: "Implementar sesión de refinement obligatoria antes de cada sprint", participants: ["María García", "Carlos López", "Ana Ruiz"] },
    ],
    risks: [],
    highlights: [
      { speaker: "Carlos López", text: "La integración de CI/CD ha reducido los tiempos de deploy un 60%", time: "00:20" },
      { speaker: "Isabel Díaz", text: "La cobertura de tests subió al 85%", time: "01:30" },
    ],
    keyData: [
      { label: "Mejora deploy", value: "-60% tiempo" },
      { label: "Cobertura tests", value: "85%" },
    ],
    openQuestions: [
      "¿Necesitamos un UX review antes de empezar desarrollo?",
    ],
    suggestedEvents: [
      { title: "Sesión refinement Sprint #15", date: "2026-04-20", time: "11:00", type: "sugerido" },
    ],
  },
  {
    id: "5",
    title: "Demo para inversores",
    date: "2026-04-16",
    time: "11:00",
    duration: "",
    status: "scheduled",
    fileType: "video",
    tags: ["Inversores", "Demo"],
    sentiment: "neutral",
    projects: ["Plataforma v2.0", "Series A"],
    participants: [
      { name: "María García", role: "CEO", speakTime: 50, sentiment: "neutral" },
      { name: "Carlos López", role: "CTO", speakTime: 30, sentiment: "neutral" },
      { name: "Inversores", role: "VC Partners", speakTime: 20, sentiment: "neutral" },
    ],
    transcript: [],
    summary: "Demo programada para presentar la plataforma v2.0 a potenciales inversores de la ronda Series A.",
    tasks: [
      { id: "t17", text: "Preparar deck de presentación", assignee: "María García", priority: "alta", done: false },
      { id: "t18", text: "Ensayo demo en staging", assignee: "Carlos López", priority: "alta", done: false },
    ],
    decisions: [],
    risks: [],
    highlights: [],
    keyData: [{ label: "Ronda objetivo", value: "Series A" }],
    openQuestions: [],
    suggestedEvents: [],
  },
  {
    id: "6",
    title: "Reunión de ventas semanal",
    date: "2026-04-11",
    time: "09:30",
    duration: "40 min",
    status: "completed",
    fileType: "audio",
    tags: ["Ventas", "Semanal"],
    sentiment: "positivo",
    projects: ["Pipeline Q2"],
    participants: [
      { name: "Javier Ruiz", role: "Sales Director", speakTime: 45, sentiment: "positivo" },
      { name: "Marta López", role: "Account Executive", speakTime: 30, sentiment: "positivo" },
      { name: "Pedro Gómez", role: "SDR", speakTime: 25, sentiment: "neutral" },
    ],
    transcript: [
      { speaker: "Javier Ruiz", time: "00:00", text: "Esta semana cerramos 3 deals por un total de 45.000€. Excelente trabajo." },
      { speaker: "Marta López", time: "00:25", text: "El deal con TechCorp está al 90%. Esperamos cierre la próxima semana." },
      { speaker: "Pedro Gómez", time: "01:00", text: "Tenemos 12 leads nuevos del webinar de ayer." },
    ],
    summary: "Semana fuerte de ventas: 3 deals cerrados por 45.000€. TechCorp al 90% de cierre. 12 leads nuevos del webinar. Pipeline Q2 en buen camino.",
    tasks: [
      { id: "t19", text: "Seguimiento deal TechCorp", assignee: "Marta López", priority: "alta", done: false },
      { id: "t20", text: "Cualificar 12 leads del webinar", assignee: "Pedro Gómez", priority: "alta", done: false },
    ],
    decisions: [
      { text: "Aumentar frecuencia de webinars a 2 por mes", participants: ["Javier Ruiz", "Marta López"] },
    ],
    risks: [
      { text: "TechCorp podría retrasar decisión por cambio en su dirección", severity: "media" },
    ],
    highlights: [
      { speaker: "Javier Ruiz", text: "Cerramos 3 deals por un total de 45.000€", time: "00:00" },
    ],
    keyData: [
      { label: "Deals cerrados", value: "3 (45.000€)" },
      { label: "Pipeline TechCorp", value: "90%" },
      { label: "Leads nuevos", value: "12" },
    ],
    openQuestions: [
      "¿Podemos ofrecer un descuento a TechCorp para acelerar el cierre?",
    ],
    suggestedEvents: [
      { title: "Follow-up TechCorp", date: "2026-04-18", time: "10:00", type: "sugerido" },
    ],
  },
];

export interface Notification {
  id: string;
  type: "meeting" | "task" | "event" | "risk";
  title: string;
  description: string;
  time: string;
  read: boolean;
}

export const mockNotifications: Notification[] = [
  { id: "n1", type: "meeting", title: "Reunión completada", description: "Revisión Sprint #14 — Resumen y tareas disponibles", time: "Hace 2h", read: false },
  { id: "n2", type: "task", title: "Nueva tarea asignada", description: "Completar integración con Stripe — Prioridad alta", time: "Hace 2h", read: false },
  { id: "n3", type: "event", title: "Evento sugerido", description: "Lanzamiento Beta v2.0 — 17 Abr, 09:00", time: "Hace 3h", read: false },
  { id: "n4", type: "risk", title: "Riesgo detectado", description: "Rendimiento del dashboard puede afectar UX en producción", time: "Hace 3h", read: true },
  { id: "n5", type: "meeting", title: "Reunión programada", description: "Sync con cliente Acme Corp — Mañana 09:00", time: "Hace 5h", read: true },
  { id: "n6", type: "event", title: "Evento en 1 hora", description: "Demo para inversores — Hoy 11:00", time: "Hace 6h", read: true },
];
