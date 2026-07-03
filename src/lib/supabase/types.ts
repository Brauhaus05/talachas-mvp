/**
 * Stable type surface for the app. `database.types.ts` is generated from the
 * live schema and overwritten wholesale by:
 *
 *   pnpm exec supabase gen types typescript --local > src/lib/supabase/database.types.ts
 *
 * This file is hand-maintained: re-export `Database` plus convenience aliases
 * for enums and row shapes, so importers depend on stable names rather than the
 * regenerated file. Add new aliases here after a schema change.
 */
import type { Database } from "./database.types";

export type { Database };

// Enum aliases
export type UserRole = Database["public"]["Enums"]["user_role"];
export type VerificationStatus = Database["public"]["Enums"]["verification_status"];
export type SlotStatus = Database["public"]["Enums"]["slot_status"];
export type BookingStatus = Database["public"]["Enums"]["booking_status"];
export type TransactionType = Database["public"]["Enums"]["transaction_type"];

// Row aliases
type Tables = Database["public"]["Tables"];
export type CityRow = Tables["cities"]["Row"];
export type ServiceCategoryRow = Tables["service_categories"]["Row"];
export type NeighborhoodRow = Tables["neighborhoods"]["Row"];
export type UserRow = Tables["users"]["Row"];
export type TalacheroProfileRow = Tables["talachero_profiles"]["Row"];
export type AvailabilitySlotRow = Tables["availability_slots"]["Row"];
export type BookingRow = Tables["bookings"]["Row"];
export type ReviewRow = Tables["reviews"]["Row"];
