import type { ServiceSlug } from "./services";

export interface TalacheroReview {
  id: string;
  authorName: string;
  authorInitials: string;
  rating: number;
  daysAgo: number;
  bodyEs: string;
  bodyEn: string;
}

export interface Talachero {
  id: string;
  name: string;
  initials: string;
  neighborhood: string;
  services: ServiceSlug[];
  primaryService: ServiceSlug;
  hourlyRateMxn: number;
  ratingAvg: number;
  ratingCount: number;
  jobsCompleted: number;
  yearsExperience: number;
  verified: boolean;
  availableToday: boolean;
  bioEs: string;
  bioEn: string;
  reviews: TalacheroReview[];
}

const review = (
  id: string,
  authorName: string,
  authorInitials: string,
  rating: number,
  daysAgo: number,
  bodyEs: string,
  bodyEn: string
): TalacheroReview => ({ id, authorName, authorInitials, rating, daysAgo, bodyEs, bodyEn });

export const TALACHEROS: Talachero[] = [
  {
    id: "carlos-mendoza",
    name: "Carlos Mendoza",
    initials: "CM",
    neighborhood: "Roma Norte",
    services: ["handyman", "furniture_assembly", "tv_mount"],
    primaryService: "handyman",
    hourlyRateMxn: 280,
    ratingAvg: 4.9,
    ratingCount: 142,
    jobsCompleted: 187,
    yearsExperience: 8,
    verified: true,
    availableToday: true,
    bioEs:
      "Especialista en mantenimiento y reparación del hogar con más de 8 años de experiencia. Trabajo rápido, limpio y con garantía. Traigo mis propias herramientas.",
    bioEn:
      "Home maintenance and repair specialist with over 8 years of experience. I work fast, clean, and with a guarantee. I bring my own tools.",
    reviews: [
      review(
        "r1",
        "Mariana Ruiz",
        "MR",
        5,
        3,
        "Carlos armó tres muebles de IKEA en una tarde. Puntual y muy profesional.",
        "Carlos assembled three IKEA pieces in one afternoon. On time and very professional."
      ),
      review(
        "r2",
        "Andrés Pérez",
        "AP",
        5,
        12,
        "Reparó una fuga difícil de encontrar en el baño. Excelente comunicación.",
        "Fixed a hard-to-find leak in the bathroom. Excellent communication."
      ),
      review(
        "r3",
        "Laura Fernández",
        "LF",
        4,
        21,
        "Buen trabajo montando la TV. Llegó un poco tarde pero avisó.",
        "Nice work mounting the TV. Arrived a bit late but let me know in advance."
      ),
    ],
  },
  {
    id: "ana-lopez",
    name: "Ana López",
    initials: "AL",
    neighborhood: "Condesa",
    services: ["cleaning", "gardening"],
    primaryService: "cleaning",
    hourlyRateMxn: 220,
    ratingAvg: 4.8,
    ratingCount: 96,
    jobsCompleted: 118,
    yearsExperience: 5,
    verified: true,
    availableToday: true,
    bioEs:
      "Limpieza profunda, cocinas y baños. Uso productos amigables con mascotas y niños. Puntual y organizada.",
    bioEn:
      "Deep cleaning, kitchens and bathrooms. I use pet- and child-friendly products. Punctual and organized.",
    reviews: [
      review(
        "r4",
        "Sofía Jiménez",
        "SJ",
        5,
        2,
        "Dejó mi departamento como nuevo. Volveré a contratarla.",
        "Left my apartment like new. Will hire again."
      ),
      review(
        "r5",
        "Diego Ramírez",
        "DR",
        5,
        9,
        "Súper detallista, incluso limpió lugares que no pedí.",
        "Very detail-oriented, cleaned spots I didn't even ask for."
      ),
    ],
  },
  {
    id: "jorge-hernandez",
    name: "Jorge Hernández",
    initials: "JH",
    neighborhood: "Del Valle",
    services: ["moving", "delivery", "handyman"],
    primaryService: "moving",
    hourlyRateMxn: 320,
    ratingAvg: 4.7,
    ratingCount: 74,
    jobsCompleted: 89,
    yearsExperience: 6,
    verified: true,
    availableToday: false,
    bioEs:
      "Mudanzas locales y entregas urgentes. Camioneta propia. Trabajo con un ayudante para cargas pesadas.",
    bioEn:
      "Local moves and urgent deliveries. My own van. I work with a helper for heavy loads.",
    reviews: [
      review(
        "r6",
        "Patricia Núñez",
        "PN",
        5,
        7,
        "Nos mudó en un solo viaje. Cuidó cada mueble con cinturones.",
        "Moved us in a single trip. Cared for every piece with straps."
      ),
      review(
        "r7",
        "Roberto Alvarado",
        "RA",
        4,
        14,
        "Buen servicio. La camioneta llegó 20 min tarde pero nada crítico.",
        "Good service. Van arrived 20 min late but nothing critical."
      ),
    ],
  },
  {
    id: "sofia-martinez",
    name: "Sofía Martínez",
    initials: "SM",
    neighborhood: "Coyoacán",
    services: ["painting", "handyman"],
    primaryService: "painting",
    hourlyRateMxn: 240,
    ratingAvg: 4.9,
    ratingCount: 61,
    jobsCompleted: 73,
    yearsExperience: 7,
    verified: true,
    availableToday: true,
    bioEs:
      "Pintura interior y exterior con acabado profesional. Reparo grietas y humedades antes de pintar.",
    bioEn:
      "Interior and exterior painting with a professional finish. I repair cracks and damp spots before painting.",
    reviews: [
      review(
        "r8",
        "Emilia Torres",
        "ET",
        5,
        5,
        "Pintó dos recámaras en un día. El acabado quedó impecable.",
        "Painted two bedrooms in a day. The finish is impeccable."
      ),
    ],
  },
  {
    id: "miguel-santos",
    name: "Miguel Santos",
    initials: "MS",
    neighborhood: "Polanco",
    services: ["tv_mount", "handyman", "furniture_assembly"],
    primaryService: "tv_mount",
    hourlyRateMxn: 260,
    ratingAvg: 4.6,
    ratingCount: 88,
    jobsCompleted: 104,
    yearsExperience: 4,
    verified: true,
    availableToday: true,
    bioEs:
      "Instalación de TV en cualquier tipo de pared, oculto de cables y configuración inicial.",
    bioEn:
      "TV installation on any wall type, cable concealment, and initial setup.",
    reviews: [
      review(
        "r9",
        "Ricardo Vidal",
        "RV",
        5,
        4,
        "Instaló mi TV de 65\" y escondió los cables. Perfecto.",
        'Mounted my 65" TV and hid the cables. Perfect.'
      ),
      review(
        "r10",
        "Carla Ávila",
        "CA",
        4,
        16,
        "Buen trabajo. Cobró un poco extra por el soporte pero fue justo.",
        "Good work. Charged a bit extra for the mount but it was fair."
      ),
    ],
  },
  {
    id: "elena-vargas",
    name: "Elena Vargas",
    initials: "EV",
    neighborhood: "Narvarte",
    services: ["gardening", "cleaning"],
    primaryService: "gardening",
    hourlyRateMxn: 200,
    ratingAvg: 4.8,
    ratingCount: 42,
    jobsCompleted: 51,
    yearsExperience: 6,
    verified: true,
    availableToday: false,
    bioEs:
      "Jardinería residencial: poda, control de plagas, diseño de macetas y mantenimiento mensual.",
    bioEn:
      "Residential gardening: pruning, pest control, planter design, and monthly maintenance.",
    reviews: [
      review(
        "r11",
        "Fernanda Solís",
        "FS",
        5,
        6,
        "Rescató mis plantas de una plaga. Muy paciente explicando cuidados.",
        "Saved my plants from a pest. Very patient explaining care."
      ),
    ],
  },
  {
    id: "raul-castillo",
    name: "Raúl Castillo",
    initials: "RC",
    neighborhood: "Álvaro Obregón",
    services: ["furniture_assembly", "handyman"],
    primaryService: "furniture_assembly",
    hourlyRateMxn: 190,
    ratingAvg: 4.7,
    ratingCount: 118,
    jobsCompleted: 141,
    yearsExperience: 5,
    verified: true,
    availableToday: true,
    bioEs:
      "Armado especializado de IKEA, Amazon, Costco. Nunca sobran piezas — lo prometo.",
    bioEn:
      "Specialized assembly for IKEA, Amazon, Costco. Never leftover pieces — I promise.",
    reviews: [
      review(
        "r12",
        "Alejandra Ponce",
        "AP",
        5,
        1,
        "Armó un ropero enorme en 2 horas. Rapidísimo.",
        "Assembled a huge wardrobe in 2 hours. Super fast."
      ),
      review(
        "r13",
        "Tomás Ibáñez",
        "TI",
        5,
        11,
        "Muy cuidadoso con los tornillos y las instrucciones.",
        "Very careful with screws and instructions."
      ),
    ],
  },
  {
    id: "veronica-flores",
    name: "Verónica Flores",
    initials: "VF",
    neighborhood: "Iztapalapa",
    services: ["cleaning", "delivery"],
    primaryService: "cleaning",
    hourlyRateMxn: 170,
    ratingAvg: 4.5,
    ratingCount: 35,
    jobsCompleted: 44,
    yearsExperience: 3,
    verified: true,
    availableToday: true,
    bioEs:
      "Limpieza semanal y post-obra. Traigo mi propio equipo. Precios accesibles.",
    bioEn:
      "Weekly and post-construction cleaning. I bring my own equipment. Accessible pricing.",
    reviews: [
      review(
        "r14",
        "Julieta Barrera",
        "JB",
        4,
        8,
        "Cumplió lo prometido y muy amable.",
        "Delivered what she promised and very kind."
      ),
    ],
  },
  {
    id: "pablo-rios",
    name: "Pablo Ríos",
    initials: "PR",
    neighborhood: "Cuauhtémoc",
    services: ["delivery", "moving"],
    primaryService: "delivery",
    hourlyRateMxn: 150,
    ratingAvg: 4.6,
    ratingCount: 58,
    jobsCompleted: 72,
    yearsExperience: 2,
    verified: true,
    availableToday: true,
    bioEs:
      "Entregas y mandados express en zona centro. Manejo motocicleta y auto pequeño.",
    bioEn:
      "Express deliveries and errands in downtown. I ride a motorcycle and drive a small car.",
    reviews: [
      review(
        "r15",
        "Iván Marín",
        "IM",
        5,
        2,
        "Recogió medicinas en menos de una hora. Excelente.",
        "Picked up medicines in under an hour. Excellent."
      ),
    ],
  },
  {
    id: "gabriela-ochoa",
    name: "Gabriela Ochoa",
    initials: "GO",
    neighborhood: "Miguel Hidalgo",
    services: ["painting", "cleaning", "handyman"],
    primaryService: "painting",
    hourlyRateMxn: 230,
    ratingAvg: 4.8,
    ratingCount: 67,
    jobsCompleted: 82,
    yearsExperience: 6,
    verified: true,
    availableToday: false,
    bioEs:
      "Pintura decorativa, texturas y acabados premium. Ofrezco muestrarios antes de empezar.",
    bioEn:
      "Decorative painting, textures, and premium finishes. I offer samples before starting.",
    reviews: [
      review(
        "r16",
        "Natalia Cerón",
        "NC",
        5,
        13,
        "Ayudó a elegir los tonos y quedó espectacular.",
        "Helped me choose tones and it turned out spectacular."
      ),
    ],
  },
];

export function getTalachero(id: string): Talachero | undefined {
  return TALACHEROS.find((t) => t.id === id);
}
