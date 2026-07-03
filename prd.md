# PRD — Talachas MVP

> Documento técnico-funcional diseñado para ser consumido directamente por un agente de desarrollo (Claude Code). Prioriza claridad estructural, nomenclatura consistente y bloques accionables sobre prosa narrativa.
>
> **Fuentes:** Notion — "002 PRD Talachas — Optimizado para Claude Code", "001 Diseño de sistema", "003 Roadmap Talachas", "Talachas 1.0" (brief). Figma — [Talachas prototype](https://www.figma.com/design/0MMgw7M0IjRKKx8bLSTcP3/Talachas?node-id=0-1).
>
> **Decisión de alcance:** este documento especifica el **alcance completo del PRD (sección 3)** como el MVP a construir — no la versión más reducida descrita en el Roadmap (registro manual de talacheros vía Google Form, sin chat, sin panel). Ver Apéndice B para el backlog post-MVP.

## 0. Contexto rápido para el LLM

- **Producto:** Talachas — plataforma bajo demanda (estilo TaskRabbit) que conecta clientes con "Talacheros" (proveedores de servicios locales verificados): armado de muebles, instalación de TV, mudanzas y transporte, mantenimiento (handyman), limpieza, jardinería, entregas y mandados.
- **Mercado inicial:** Ciudad de México, México (MEX). La arquitectura debe soportar expansión multi-ciudad/multi-moneda desde el modelo de datos, aunque el lanzamiento sea de un solo mercado.
- **Fase actual:** MVP. Prioriza velocidad de entrega y simplicidad operativa, sin cerrar la puerta a escalar (ver sección 6).
- **Idiomas:** Producto bilingüe (inglés/español). El copy debe estar internacionalizado desde el inicio (claves i18n, no strings hardcodeados).
- **Prototipo de referencia:** el archivo de Figma vinculado arriba contiene 5 pantallas de alta fidelidad que ilustran el happy path completo (ver Apéndice A). Úsalas como referencia visual y de contenido, no como especificación pixel-perfect final.

## 1. Problema y propuesta de valor

**Problema:** Encontrar ayuda confiable y verificada para tareas físicas cotidianas (armado de muebles, mudanzas, limpieza, instalación de TV, jardinería, mandados) es lento, informal y de calidad inconsistente.

**Propuesta de valor:**

- Para el **cliente**: agendar un Talachero verificado en minutos, comparar precio/habilidades/reseñas, pagar y calificar todo dentro de la app.
- Para el **Talachero**: generar ingresos flexibles ofreciendo sus habilidades, con verificación que genera confianza y un sistema de pagos integrado (incluye propinas).

## 2. User Personas

### Persona 1 — Cliente ("Quien necesita ayuda")

| Atributo                           | Detalle                                                                                                                                                                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nombre ficticio                    | Mariana, 34 años                                                                                                                                                                                                      |
| Rol                                | Cliente que solicita servicios                                                                                                                                                                                        |
| Contexto                           | Vive en departamento, trabaja tiempo completo, poco tiempo libre                                                                                                                                                      |
| Objetivo principal                 | Resolver una tarea doméstica rápido, sin fricción y con confianza en la calidad/seguridad de la persona que entra a su casa                                                                                           |
| Necesidades funcionales            | Buscar por tipo de servicio, comparar precio/reseñas/disponibilidad, reservar same-day o programado, chatear con el Talachero antes/durante el servicio, pagar y dar propina dentro de la app, calificar al finalizar |
| Frustraciones a resolver           | Falta de transparencia en precios, miedo a contratar a alguien no verificado, falta de visibilidad del estatus de la reserva                                                                                          |
| Métricas de éxito (su perspectiva) | Tiempo hasta agendar < 3 minutos, Talachero llega a tiempo, precio final coincide con el cotizado                                                                                                                     |

### Persona 2 — Talachero ("Quien ofrece el servicio")

| Atributo                           | Detalle                                                                                                                                                                                                                                                                            |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nombre ficticio                    | Jorge, 41 años                                                                                                                                                                                                                                                                     |
| Rol                                | Proveedor de servicios independiente (handyman, mudanzas, limpieza, etc.)                                                                                                                                                                                                          |
| Contexto                           | Trabaja por cuenta propia o como ingreso complementario, busca flexibilidad de horario                                                                                                                                                                                             |
| Objetivo principal                 | Generar ingresos consistentes llenando huecos en su agenda, con pagos rápidos y seguros                                                                                                                                                                                            |
| Necesidades funcionales            | Crear perfil con habilidades/tarifas/portafolio, completar verificación de identidad y antecedentes, definir disponibilidad (incluye same-day), recibir y aceptar/rechazar solicitudes, chatear con el cliente, recibir pago + propina automáticamente, ver historial de ganancias |
| Frustraciones a resolver           | Pagos lentos o poco claros, falta de control sobre su disponibilidad, exposición a clientes problemáticos sin sistema de reseñas bidireccional                                                                                                                                     |
| Métricas de éxito (su perspectiva) | Tiempo de pago < 24–48h, tasa de aceptación de solicitudes relevante a su zona/habilidades, reseñas justas y visibles                                                                                                                                                              |

> **Nota para Claude Code:** todo el modelo de permisos (roles) debe distinguir explícitamente `client` y `talachero` desde el esquema inicial (ver sección 7), incluso aunque un mismo usuario pudiera eventualmente tener ambos roles en el futuro (fuera de alcance del MVP, ver sección 4).

## 3. Alcance del MVP (in scope)

1. Registro/autenticación para ambos roles (cliente y Talachero).
2. Perfil de Talachero: servicios ofrecidos, tarifa por hora, zona de cobertura, fotos de portafolio, reseñas.
3. Verificación de identidad/antecedentes para Talacheros (vía proveedor externo, no construido internamente).
4. Búsqueda y filtrado de Talacheros por servicio, precio, calificación y disponibilidad.
5. Sistema de disponibilidad tipo calendario de slots (same-day y programado).
6. Flujo de reserva con confirmación y manejo de concurrencia (evitar doble-booking).
7. Chat 1:1 entre cliente y Talachero ligado a una reserva.
8. Pagos: cobro al cliente, comisión de plataforma, payout al Talachero, propina opcional (vía Stripe Connect u equivalente).
9. Sistema de calificación y reseña bidireccional al completar el servicio.
10. Notificaciones (push/email) para eventos clave: reserva confirmada, recordatorio, pago procesado, nueva reseña.
11. Panel de administración básico (moderación de usuarios, disputas, reembolsos).

## 4. Fuera de alcance (out of scope para MVP)

- Multi-rol simultáneo (un usuario siendo cliente y Talachero a la vez).
- Soporte multi-idioma completo en UI (se deja la infraestructura i18n lista, pero el MVP lanza solo en español/inglés básico).
- Programación recurrente automática de servicios.
- Marketplace B2B / cuentas empresariales.
- App nativa (el MVP puede ser web responsiva / PWA; apps nativas se evalúan post-MVP).

## 5. Lineamientos de UI/UX para el MVP

> **Restricción de diseño explícita:** todas las tareas de UI en esta fase deben usar **únicamente blanco, negro y escala de grises**. No introducir colores de marca, acentos de color, ni paletas decorativas — la decisión de color se tomará en una fase posterior. Esto aplica a botones, estados (success/error/warning incluidos), íconos y cualquier elemento visual.

- Usar variaciones de peso tipográfico, tamaño, espaciado y contraste de grises para jerarquía visual, en lugar de color.
- Estados como "error" o "éxito" deben comunicarse con iconografía + texto + variación de gris/negro, no con rojo/verde.
- Dejar preparado un sistema de tokens de diseño (ej. `color.background`, `color.text.primary`, `color.border`) para que la futura paleta de color se pueda inyectar sin rehacer componentes.
- Mantener un sistema de espaciado y tipografía consistente (8pt grid sugerido) para que la base visual sea sólida independientemente del color.

### Referencia visual (Figma)

El prototipo en Figma (ver enlace en la cabecera) ya refleja esta restricción de escala de grises y cubre el happy path completo de reserva. Usar como referencia de estructura/contenido para las siguientes pantallas (ver Apéndice A para detalle):

| Pantalla                                   | Cubre requisito(s) de sección 3              |
| ------------------------------------------ | -------------------------------------------- |
| Home / landing                             | Punto de entrada, búsqueda por servicio (#4) |
| Resultados de búsqueda                     | Búsqueda y filtrado de Talacheros (#4)       |
| Perfil de Talachero                        | Perfil de Talachero, reseñas (#2, #9)        |
| Solicitar servicio (formulario de reserva) | Flujo de reserva (#5, #6)                    |
| Resumen de reserva / checkout              | Pagos, comisión, propina (#8)                |

No hay pantallas en el prototipo para: autenticación/registro (#1), verificación de identidad (#3), chat (#7), notificaciones (#10), ni panel de administración (#11) — estas deben diseñarse siguiendo el mismo sistema de tokens en escala de grises.

## 6. Arquitectura y requisitos técnicos

### 6.1 Arquitectura general

- **Monolito modular primero, microservicios después.** Backend monolítico organizado por dominios (usuarios, Talacheros, reservas, pagos, chat, reseñas), con límites claros (bounded contexts) entre módulos para poder extraer servicios independientes después (ej. pagos, notificaciones) cuando el tráfico lo justifique.
- **API-first.** Contratos REST o GraphQL claros desde el día uno (OpenAPI/GraphQL schema) para que web, futura app móvil y futuros integradores B2B consuman la misma capa sin duplicar lógica.
- **Diseño orientado a eventos desde temprano (aunque sea simple).** Cola de mensajes (SQS, RabbitMQ, o bus interno simple) para eventos clave: "reserva creada", "pago confirmado", "servicio completado". Facilita añadir features después (notificaciones, analítica, fraude) sin tocar el flujo principal.

### 6.2 Base de datos

- **PostgreSQL como núcleo.** Entidades centrales (usuarios, Talacheros, reservas, pagos, reseñas) requieren relaciones fuertes y transacciones ACID.
- **Separar lecturas pesadas (búsqueda/match) en un índice dedicado.** Considerar Elasticsearch/OpenSearch o al menos índices geoespaciales (PostGIS) desde el inicio — el matching por ubicación es el corazón del producto y es costoso de migrar después.
- **Diseñar el esquema pensando en multi-ciudad/multi-mercado desde el día uno** (`city_id`, `currency`, `locale`, reglas de precio por región), aunque se lance en una sola ciudad.

### 6.3 Disponibilidad y reservas

- **Modelo de disponibilidad como "calendario de slots", no flags simples.** Soporta same-day y agendado, evita rediseños al agregar recurrencia o múltiples servicios por Talachero.
- **Manejo de concurrencia.** Locks optimistas o transacciones con `SELECT FOR UPDATE` para evitar doble-booking cuando dos clientes reservan al mismo Talachero simultáneamente.

### 6.4 Pagos y dinero

- **Delegar el procesamiento de pagos a un proveedor** (Stripe Connect, Adyen Marketplace). No construir motor propio de pagos/payouts — estos proveedores manejan split payments (comisión + payout), propinas, reembolsos y cumplimiento KYC.
- **Idempotencia en todas las operaciones financieras.** Claves de idempotencia en cada transacción para evitar cobros duplicados ante reintentos de red.
- **Ledger inmutable de transacciones.** Cada movimiento de dinero como evento append-only; nunca sobrescribir saldos. Crítico para auditoría y disputas.

### 6.5 Verificación e identidad

- **Proveedor externo de verificación de identidad/antecedentes** (ej. Persona, Checkr, Veriff) en lugar de construirlo internamente. El cumplimiento varía por ciudad/país; un proveedor especializado permite expandirse sin rehacer el flujo.

### 6.6 Chat y notificaciones

- **Chat en tiempo real vía WebSockets o servicio gestionado** (Twilio Conversations, Sendbird, Firebase). No construir infraestructura de mensajería propia.
- **Sistema de notificaciones centralizado y desacoplado** (push, SMS, email) consumiendo los eventos de 6.1, para no acoplar notificaciones a cada flujo de negocio.

### 6.7 Infraestructura y escalabilidad

- **Contenedores desde el inicio (Docker) + despliegue gestionado** (ECS/Fargate, Cloud Run o similar).
- **Servidores de aplicación stateless.** Estado de sesión fuera del servidor (BD o Redis) para escalar horizontalmente sin fricción.
- **Cache (Redis)** para datos de lectura frecuente (perfiles de Talacheros, disponibilidad, resultados de búsqueda).
- **CDN para assets estáticos e imágenes** (fotos de perfil, portafolios de trabajos).

### 6.8 Observabilidad y calidad desde el MVP

- **Logging estructurado, métricas y tracing distribuido desde el día uno** (stack basado en OpenTelemetry).
- **Feature flags** para lanzar funcionalidades nuevas (nuevas categorías de servicio, nuevas ciudades) de forma gradual y segura.
- **CI/CD con pruebas automatizadas** desde el primer commit, priorizando flujos críticos: reservas, pagos y autenticación.

### 6.9 Seguridad

- **Cumplimiento PCI DSS delegado al proveedor de pagos** (no almacenar datos de tarjetas directamente).
- **Control de acceso basado en roles** (cliente, Talachero, admin, soporte) desde el modelo de datos inicial — agregar roles granulares después suele requerir migraciones grandes.
- **Rate limiting y protección anti-fraude básica** en endpoints críticos (registro, pagos, reseñas) desde el lanzamiento.

## 7. Modelo de datos (entidades principales)

```javascript
User
├─ id, email, phone, locale, created_at
├─ role: "client" | "talachero" | "admin"
└─ profile (1:1, distinto shape según role)

TalacheroProfile
├─ user_id (FK)
├─ services: [ServiceCategory]
├─ hourly_rate, currency
├─ city_id, coverage_area (geo)
├─ verification_status: "pending" | "verified" | "rejected"
├─ portfolio_photos: [url]
└─ rating_avg, rating_count

ServiceCategory
├─ id, name, icon

AvailabilitySlot
├─ talachero_id (FK)
├─ start_time, end_time
└─ status: "open" | "booked" | "blocked"

Booking
├─ id, client_id (FK), talachero_id (FK), service_category_id (FK)
├─ slot_id (FK)
├─ status: "requested" | "confirmed" | "in_progress" | "completed" | "cancelled"
├─ price, tip, currency
└─ created_at, updated_at

Transaction (ledger, append-only)
├─ id, booking_id (FK)
├─ type: "charge" | "payout" | "refund" | "tip"
├─ amount, currency
└─ created_at

ChatThread / ChatMessage
├─ booking_id (FK)
├─ sender_id (FK)
└─ body, created_at

Review
├─ booking_id (FK)
├─ author_id (FK), target_id (FK)
├─ rating (1-5), comment
└─ created_at
```

## 8. Flujos clave (happy path)

1. **Onboarding Talachero:** registro → completar perfil → verificación de identidad → definir disponibilidad → perfil queda visible en búsqueda.
2. **Reserva del cliente:** buscar/filtrar → ver perfil de Talachero → seleccionar slot → confirmar reserva → pago autorizado → notificación a ambas partes.
3. **Ejecución del servicio:** chat pre-servicio → Talachero marca "en progreso" → Talachero marca "completado" → cliente confirma/paga propina → ambos dejan reseña.
4. **Manejo de cancelación:** cliente o Talachero cancela antes del slot → liberar disponibilidad → aplicar política de reembolso/penalización según ventana de tiempo.

## 9. Métricas de éxito del MVP

- Tiempo promedio entre búsqueda y reserva confirmada.
- Tasa de reservas completadas vs. canceladas.
- Tiempo promedio de payout a Talacheros.
- Calificación promedio (cliente y Talachero).
- Tasa de Talacheros verificados activos por semana.

## 10. Instrucciones de implementación para Claude Code

- Empezar por el modelo de datos (sección 7) y migraciones antes de cualquier UI.
- Implementar cada dominio (usuarios, reservas, pagos, chat, reseñas) como módulo aislado dentro del monolito, con interfaces claras entre módulos.
- Toda la UI debe construirse con un sistema de diseño en escala de grises (sección 5) usando tokens, no valores de color hardcodeados. Usar el prototipo de Figma (Apéndice A) como referencia de layout/contenido para las 5 pantallas ya diseñadas.
- Todo texto visible en UI debe pasar por claves i18n (no strings hardcodeados), incluso si el MVP lanza en un solo idioma por mercado.
- Priorizar pruebas automatizadas en los flujos de reservas y pagos antes que en flujos secundarios (ej. panel de admin).
- No implementar lógica propia de procesamiento de pagos, KYC o mensajería en tiempo real — integrar los proveedores externos indicados en la sección 6.

## Apéndice A — Inventario de pantallas en Figma

Archivo: [Talachas](https://www.figma.com/design/0MMgw7M0IjRKKx8bLSTcP3/Talachas?node-id=0-1) · Página única "Desktop One" (`0:1`).

1. **Home / landing** — hero "Tus tareas hechas por manos expertas", buscador y grid de "Servicios Populares".
2. **Resultados de búsqueda** — "Talacheros en tu zona (Vancouver)", lista filtrable de tarjetas con nombre, rating y tarifa por hora.
3. **Perfil de Talachero** — ejemplo "Carlos Mendoza": estadísticas (trabajos completados, reseñas), servicios ofrecidos con precio, sección "Sobre mí" y reseñas.
4. **Solicitar servicio** — formulario de reserva con tipo de trabajo, descripción, dirección, fecha preferida y método de pago.
5. **Resumen de reserva / checkout** — resumen de orden (servicio, fecha, dirección, pago, total) y botón "Confirmar Reserva".

Estilo visual: escala de grises/blanco y negro, layout basado en tarjetas — consistente con la restricción de la sección 5.

> Nota: el prototipo usa "Vancouver" y precios en MXN como placeholder de una versión anterior del proyecto; el mercado de lanzamiento real es Ciudad de México (sección 0). Ajustar copy/localización al implementar, no la estructura de las pantallas.

## Apéndice B — Backlog post-MVP (fuera de este documento)

Del roadmap del proyecto, explícitamente diferido a versiones futuras y **no** parte de este PRD:

- Automatización total del registro de Talacheros (el roadmap original contemplaba onboarding manual vía formulario de Google como paso intermedio; este PRD ya especifica registro/verificación in-app como parte del MVP — ver sección 3, #1 y #3).
- Panel de control para clientes.
- Panel de control para Talacheros (más allá de lo cubierto en sección 3).
- Cotizaciones automatizadas asistidas por IA.
- Chatbot de asistencia a clientes.
- Calendario automatizado avanzado (más allá del calendario de slots de la sección 6.3).
- Multi-rol simultáneo, soporte multi-idioma completo, programación recurrente, marketplace B2B, apps nativas (ver sección 4).
