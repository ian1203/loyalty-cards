import { foreignKey, index, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { customers } from "./customers";
import { employees } from "./employees";
import { locations } from "./locations";
import { loyaltyPrograms } from "./loyaltyPrograms";

export const transactionTypeEnum = pgEnum("transaction_type", ["stamp"]);

// Ledger inmutable: solo created_at, sin updated_at ni trigger — un evento
// de sello no se edita.
export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    customerId: uuid("customer_id").notNull(),
    loyaltyProgramId: uuid("loyalty_program_id").notNull(),
    locationId: uuid("location_id").notNull(),
    employeeId: uuid("employee_id"),
    type: transactionTypeEnum("type").notNull().default("stamp"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("transactions_business_id_idempotency_key_key").on(
      table.businessId,
      table.idempotencyKey,
    ),
    index("transactions_business_id_customer_id_idx").on(
      table.businessId,
      table.customerId,
    ),
    foreignKey({
      columns: [table.customerId, table.businessId],
      foreignColumns: [customers.id, customers.businessId],
      name: "transactions_customer_id_business_id_customers_fk",
    }),
    foreignKey({
      columns: [table.loyaltyProgramId, table.businessId],
      foreignColumns: [loyaltyPrograms.id, loyaltyPrograms.businessId],
      name: "transactions_loyalty_program_id_business_id_loyalty_programs_fk",
    }),
    foreignKey({
      columns: [table.locationId, table.businessId],
      foreignColumns: [locations.id, locations.businessId],
      name: "transactions_location_id_business_id_locations_fk",
    }),
    foreignKey({
      columns: [table.employeeId, table.businessId],
      foreignColumns: [employees.id, employees.businessId],
      name: "transactions_employee_id_business_id_employees_fk",
    }),
  ],
);
