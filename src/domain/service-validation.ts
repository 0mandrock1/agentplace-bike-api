import { z } from 'zod';
import {SERVICES} from './services.js';

export const servicesSchema = z.enum(SERVICES);