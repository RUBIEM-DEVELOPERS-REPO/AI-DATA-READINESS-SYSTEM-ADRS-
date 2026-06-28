import { db } from "../db";
import { dataControllers, processingRecords, insertDataControllerSchema, insertProcessingRecordSchema } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function listDataControllers(tenantId: string) {
  return await db
    .select()
    .from(dataControllers)
    .where(eq(dataControllers.tenantId, tenantId))
    .orderBy(dataControllers.createdAt);
}

export async function createDataController(data: any, tenantId: string) {
  const payload = insertDataControllerSchema.parse({
    controllerCode: data.controllerCode || `CTRL-${Date.now()}`,
    name: data.name,
    contactName: data.contactName,
    contactEmail: data.contactEmail,
    organisation: data.organisation,
    address: data.address,
    metadata: data.metadata || {},
    tenantId,
  });

  const [record] = await db.insert(dataControllers).values(payload).returning();
  return record;
}

export async function listProcessingRecords(tenantId: string) {
  return await db
    .select()
    .from(processingRecords)
    .where(eq(processingRecords.tenantId, tenantId))
    .orderBy(processingRecords.createdAt);
}

export async function createProcessingRecord(data: any, tenantId: string) {
  if (!data.controllerId) {
    throw Object.assign(new Error("Controller selection is required."), { status: 400 });
  }

  const controllerExists = await db.select().from(dataControllers).where(eq(dataControllers.id, data.controllerId));
  if (controllerExists.length === 0) {
    throw Object.assign(new Error("Selected data controller does not exist."), { status: 404 });
  }

  const payload = insertProcessingRecordSchema.parse({
    recordCode: data.recordCode || `PR-${Date.now()}`,
    controllerId: data.controllerId,
    purpose: data.purpose,
    lawfulBasis: data.lawfulBasis,
    dataCategories: Array.isArray(data.dataCategories) ? data.dataCategories : String(data.dataCategories || "").split(",").map((item: string) => item.trim()).filter(Boolean),
    retentionPolicy: data.retentionPolicy || null,
    thirdParties: data.thirdParties || null,
    processingActivities: data.processingActivities || null,
    status: data.status || "ACTIVE",
    tenantId,
  });

  const [record] = await db.insert(processingRecords).values(payload).returning();
  return record;
}
