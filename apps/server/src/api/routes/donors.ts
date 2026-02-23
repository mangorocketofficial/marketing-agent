import { Router, type Request, type Response } from 'express';
import type { DatabaseClient } from '../../db';
import { asString } from '../../utils/db';
import {
  createRecipient,
  getRecipientById,
  getRecipientSummary,
  listRecipientsByCustomer,
  removeRecipient,
  type RecipientRecord,
  type RecipientStatus,
  updateRecipient,
} from '../../services/donor/manager';

interface RecipientPayload {
  customerId?: string;
  name?: string;
  email?: string;
  receiveReport?: boolean;
  status?: RecipientStatus;
}

const RECIPIENT_STATUSES: RecipientStatus[] = ['active', 'paused', 'unsubscribed'];

function asBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
  }
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return null;
}

function isValidStatus(value: unknown): value is RecipientStatus {
  return typeof value === 'string' && RECIPIENT_STATUSES.includes(value as RecipientStatus);
}

function validateCreatePayload(payload: RecipientPayload): string | null {
  if (!asString(payload.customerId)) return 'customerId is required';
  if (!asString(payload.name)) return 'name is required';
  if (!asString(payload.email)) return 'email is required';
  if (typeof payload.receiveReport !== 'boolean') return 'receiveReport is required';
  if (!isValidStatus(payload.status)) return 'status is invalid';
  return null;
}

function validateUpdatePayload(payload: RecipientPayload): string | null {
  if (payload.customerId !== undefined && !asString(payload.customerId)) return 'customerId is invalid';
  if (payload.name !== undefined && !asString(payload.name)) return 'name is invalid';
  if (payload.email !== undefined && !asString(payload.email)) return 'email is invalid';
  if (payload.receiveReport !== undefined && typeof payload.receiveReport !== 'boolean') {
    return 'receiveReport must be a boolean';
  }
  if (payload.status !== undefined && !isValidStatus(payload.status)) return 'status is invalid';
  return null;
}

function toCreateInput(payload: RecipientPayload): Omit<RecipientRecord, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    customerId: String(payload.customerId).trim(),
    name: String(payload.name).trim(),
    email: String(payload.email).trim(),
    receiveReport: Boolean(payload.receiveReport),
    status: payload.status as RecipientStatus,
  };
}

function toUpdateInput(payload: RecipientPayload): Partial<Omit<RecipientRecord, 'id' | 'createdAt' | 'updatedAt'>> {
  const result: Partial<Omit<RecipientRecord, 'id' | 'createdAt' | 'updatedAt'>> = {};
  if (payload.customerId !== undefined) result.customerId = String(payload.customerId).trim();
  if (payload.name !== undefined) result.name = String(payload.name).trim();
  if (payload.email !== undefined) result.email = String(payload.email).trim();
  if (payload.receiveReport !== undefined) result.receiveReport = payload.receiveReport;
  if (payload.status !== undefined) result.status = payload.status;
  return result;
}

export function createDonorsRouter(db: DatabaseClient): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    const customerId = asString(req.query.customerId);
    if (!customerId) {
      res.status(400).json({ message: 'customerId is required' });
      return;
    }

    const status = asString(req.query.status);
    if (status && !isValidStatus(status)) {
      res.status(400).json({ message: 'status is invalid' });
      return;
    }

    const receiveReport = asBoolean(req.query.receiveReport);
    if (req.query.receiveReport !== undefined && receiveReport === null) {
      res.status(400).json({ message: 'receiveReport is invalid' });
      return;
    }

    const all = await listRecipientsByCustomer(db, customerId);
    const filtered = all.filter((item) => {
      if (status && item.status !== status) return false;
      if (receiveReport !== null && item.receiveReport !== receiveReport) return false;
      return true;
    });

    res.status(200).json(filtered);
  });

  router.get('/summary', async (req: Request, res: Response) => {
    const customerId = asString(req.query.customerId);
    if (!customerId) {
      res.status(400).json({ message: 'customerId is required' });
      return;
    }

    const summary = await getRecipientSummary(db, customerId);
    res.status(200).json(summary);
  });

  router.get('/:id', async (req: Request, res: Response) => {
    const recipient = await getRecipientById(db, String(req.params.id));
    if (!recipient) {
      res.status(404).json({ message: 'Recipient not found' });
      return;
    }
    res.status(200).json(recipient);
  });

  router.post('/', async (req: Request, res: Response) => {
    const payload = req.body as RecipientPayload;
    const validationError = validateCreatePayload(payload);
    if (validationError) {
      res.status(400).json({ message: validationError });
      return;
    }

    const created = await createRecipient(db, toCreateInput(payload));
    res.status(201).json(created);
  });

  router.put('/:id', async (req: Request, res: Response) => {
    const recipientId = String(req.params.id);
    const payload = req.body as RecipientPayload;
    const validationError = validateUpdatePayload(payload);
    if (validationError) {
      res.status(400).json({ message: validationError });
      return;
    }

    const updated = await updateRecipient(db, recipientId, toUpdateInput(payload));
    if (!updated) {
      res.status(404).json({ message: 'Recipient not found' });
      return;
    }
    res.status(200).json(updated);
  });

  router.delete('/:id', async (req: Request, res: Response) => {
    const recipientId = String(req.params.id);
    const removed = await removeRecipient(db, recipientId);
    if (!removed) {
      res.status(404).json({ message: 'Recipient not found' });
      return;
    }
    res.status(204).send();
  });

  return router;
}
