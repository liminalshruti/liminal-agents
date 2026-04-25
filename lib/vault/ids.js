import crypto from "node:crypto";

export const newId = () => crypto.randomUUID();
