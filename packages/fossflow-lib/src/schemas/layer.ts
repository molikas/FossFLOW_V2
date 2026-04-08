import { z } from 'zod';
import { id, constrainedStrings } from './common';

export const layerSchema = z.object({
  id,
  name: constrainedStrings.name,
  visible: z.boolean(),
  locked: z.boolean(),
  order: z.number().int()
});

export const layersSchema = z.array(layerSchema);
