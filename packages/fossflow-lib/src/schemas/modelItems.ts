import { z } from 'zod';
import { id, constrainedStrings } from './common';

export const modelItemSchema = z.object({
  id,
  name: constrainedStrings.name,
  description: constrainedStrings.description.optional(),
  notes: z.string().optional(),
  headerLink: z.string().max(2048).optional(),
  link: z.string().max(256).optional(),
  icon: id.optional()
});

export const modelItemsSchema = z.array(modelItemSchema);
