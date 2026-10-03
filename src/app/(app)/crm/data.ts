import "server-only";
import { db } from "@/lib/db";

export const activeUsers = () =>
  db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });

export const orgOptions = () => db.organization.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
